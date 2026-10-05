// Edge Function: tutor-chat
//
// POST { child_id, message, lang? } with the parent's session token.
// Responds with server-sent events: notice | sentence | replace | done.
// All safety logic lives in ../_shared/tutor-pipeline.ts (unit-tested); this file only
// wires it to Supabase and the Claude API.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { type AnthropicConfig, createMessage, streamMessage } from '../_shared/anthropic.ts';
import { bearerToken, corsHeaders, json, parseAllowedOrigins, sseEvent, UUID_RE } from '../_shared/http.ts';
import {
  INTENT_CLASSIFIER_PROMPT, type Lang, OUTPUT_CLASSIFIER_PROMPT, parseIntentLabel,
  parseOutputLabel, TUTOR_MODEL, wrapForClassifier,
} from '../_shared/prompts.ts';
import { type GateResult, runTutorTurn, type Turn, type TutorDeps } from '../_shared/tutor-pipeline.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC: AnthropicConfig = { apiKey: requireEnv('ANTHROPIC_API_KEY') };
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
const SCHOOL_NAMES = (Deno.env.get('SCHOOL_NAMES') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const CLASSIFIER_TIMEOUT_MS = 8_000;
const ANSWER_TIMEOUT_MS = 30_000;

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await service.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data as T;
}

function buildDeps(): TutorDeps {
  return {
    schoolNames: SCHOOL_NAMES,
    gate: (userId, childId) => rpc<GateResult>('svc_tutor_gate', { p_user: userId, p_child: childId }),
    recentTurns: (childId) => rpc<Turn[]>('svc_recent_tutor_turns', { p_child: childId, p_limit: 6 }),
    logTurn: (input) =>
      rpc<{ used: number; limit: number }>('svc_log_tutor_turn', {
        p_child: input.childId,
        p_child_text: input.childText,
        p_child_flags: input.childFlags,
        p_tutor_text: input.tutorText,
        p_tutor_flags: input.tutorFlags,
        p_input_tokens: input.usage?.inputTokens ?? null,
        p_output_tokens: input.usage?.outputTokens ?? null,
      }),
    logSafetyEvent: async (childId, kind, severity, detail) => {
      await rpc('svc_log_safety_event', { p_child: childId, p_kind: kind, p_severity: severity, p_detail: detail });
    },
    classifyIntent: async (message) => {
      const { text } = await createMessage(ANTHROPIC, {
        model: TUTOR_MODEL,
        system: INTENT_CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: wrapForClassifier('child_message', message) }],
        max_tokens: 10,
        temperature: 0,
      }, AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS));
      return parseIntentLabel(text);
    },
    streamAnswer: (system, messages, signal) =>
      streamMessage(ANTHROPIC, {
        model: TUTOR_MODEL,
        system,
        messages,
        max_tokens: 300,
        temperature: 0.4,
        cacheSystem: true,
      }, AbortSignal.any([signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)])),
    classifyOutput: async (answer) => {
      const { text } = await createMessage(ANTHROPIC, {
        model: TUTOR_MODEL,
        system: OUTPUT_CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: wrapForClassifier('tutor_reply', answer) }],
        max_tokens: 5,
        temperature: 0,
      }, AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS));
      return parseOutputLabel(text);
    },
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('origin'), ALLOWED_ORIGINS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const token = bearerToken(request);
  if (!token) return json(401, { error: 'unauthorized' }, cors);

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user || userData.user.is_anonymous) {
    return json(401, { error: 'unauthorized' }, cors);
  }

  let body: { child_id?: unknown; message?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' }, cors);
  }
  if (typeof body.child_id !== 'string' || !UUID_RE.test(body.child_id) || typeof body.message !== 'string') {
    return json(400, { error: 'invalid_request' }, cors);
  }

  const fallbackLang: Lang = body.lang === 'en' ? 'en' : 'he';
  const turn = runTutorTurn(buildDeps(), {
    userId: userData.user.id,
    childId: body.child_id,
    message: body.message,
    fallbackLang,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of turn) {
          controller.enqueue(encoder.encode(sseEvent(event.type, event)));
        }
      } catch (error) {
        console.error('tutor turn failed', (error as Error).message);
        controller.enqueue(encoder.encode(sseEvent('notice', {
          type: 'notice',
          kind: 'unavailable',
          text: fallbackLang === 'en'
            ? 'The helper is taking a short rest. Please try again in a moment.'
            : 'העוזר נח רגע. אפשר לנסות שוב עוד מעט.',
        })));
        controller.enqueue(encoder.encode(sseEvent('done', { type: 'done', used: null, limit: null })));
      } finally {
        controller.close();
      }
    },
    async cancel() {
      // The child closed the chat: stop generating.
      await turn.return(undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
});
