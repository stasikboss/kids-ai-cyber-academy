import type { MessageParam, StreamEvent, Usage } from './anthropic.ts';
import { checkOutputSentence } from './output-filter.ts';
import { detectPii, piiKinds, redact } from './pii.ts';
import {
  type AgeBand, type FixedReply, fixedReply, type IntentLabel, type Lang,
  type OutputLabel, tutorSystemPrompt,
} from './prompts.ts';
import { SentenceBuffer } from './sentences.ts';

/**
 * One tutor turn, from the child's message to the stored transcript:
 *
 *   gate → PII check → intent classifier → streamed answer with per-sentence checks
 *   → output classifier → store
 *
 * Every dependency is injected so the whole flow runs in unit tests with fakes.
 */

export const MAX_MESSAGE_LENGTH = 500;

export type GateReason =
  | 'not_found' | 'child_inactive' | 'tutor_disabled' | 'consent_required' | 'time_up' | 'quota_reached';

export interface GateResult {
  allowed: boolean;
  reason?: GateReason | null;
  used?: number;
  limit?: number;
  language?: Lang;
  age_band?: AgeBand;
}

export interface Turn {
  role: 'child' | 'tutor';
  text_redacted: string;
}

export interface LogTurnInput {
  childId: string;
  childText: string;
  childFlags: string[];
  tutorText: string | null;
  tutorFlags: string[];
  usage: Usage | null;
}

export type SafetyKind = 'pii_blocked' | 'output_blocked' | 'distress' | 'unsafe_request' | 'manipulation';

export interface TutorDeps {
  gate(userId: string, childId: string): Promise<GateResult>;
  recentTurns(childId: string): Promise<Turn[]>;
  logTurn(input: LogTurnInput): Promise<{ used: number; limit: number }>;
  logSafetyEvent(childId: string, kind: SafetyKind, severity: 'info' | 'warn' | 'high', detail: Record<string, unknown>): Promise<void>;
  classifyIntent(message: string): Promise<IntentLabel>;
  streamAnswer(system: string, messages: MessageParam[], signal: AbortSignal): AsyncIterable<StreamEvent>;
  classifyOutput(answer: string): Promise<OutputLabel>;
  /** Optional per-deployment list of local school names to block. */
  schoolNames?: string[];
}

export type TutorEvent =
  /** A fixed, human-written reply; `kind` lets the app style it. */
  | { type: 'notice'; kind: FixedReply; text: string }
  /** One checked sentence of the model's answer, to append. */
  | { type: 'sentence'; text: string }
  /** Replace everything shown for this answer with `text`. */
  | { type: 'replace'; text: string }
  | { type: 'done'; used: number | null; limit: number | null };

export interface TurnRequest {
  userId: string;
  childId: string;
  message: string;
  /** Language for replies when the child cannot be resolved. */
  fallbackLang: Lang;
}

const INTENT_ROUTES: Partial<Record<IntentLabel, {
  reply: FixedReply;
  event?: { kind: SafetyKind; severity: 'info' | 'warn' | 'high' };
}>> = {
  distress: { reply: 'support', event: { kind: 'distress', severity: 'high' } },
  unsafe: { reply: 'refusal', event: { kind: 'unsafe_request', severity: 'warn' } },
  manipulation: { reply: 'manipulation', event: { kind: 'manipulation', severity: 'info' } },
  off_topic: { reply: 'off_topic' },
};

/** Claude needs strictly alternating roles starting with the user. */
export function toModelMessages(history: Turn[], message: string): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const turn of history) {
    const role = turn.role === 'child' ? 'user' : 'assistant';
    const last = messages.at(-1);
    if (last && last.role === role) {
      last.content += `\n${turn.text_redacted}`;
    } else {
      messages.push({ role, content: turn.text_redacted });
    }
  }
  while (messages[0]?.role === 'assistant') messages.shift();
  if (messages.at(-1)?.role === 'user') messages.pop();
  messages.push({ role: 'user', content: message });
  return messages;
}

export async function* runTutorTurn(deps: TutorDeps, request: TurnRequest): AsyncGenerator<TutorEvent> {
  const message = request.message.trim();
  let lang: Lang = request.fallbackLang;

  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    yield { type: 'notice', kind: 'invalid_message', text: fixedReply('invalid_message', lang) };
    yield { type: 'done', used: null, limit: null };
    return;
  }

  // 1. Gate: family membership, consent, on/off switch, daily quota.
  const gate = await deps.gate(request.userId, request.childId);
  if (gate.language) lang = gate.language;
  if (!gate.allowed) {
    const reason: GateReason = gate.reason ?? 'not_found';
    yield { type: 'notice', kind: reason, text: fixedReply(reason, lang) };
    yield { type: 'done', used: gate.used ?? null, limit: gate.limit ?? null };
    return;
  }
  const ageBand: AgeBand = gate.age_band ?? '8-9';

  // 2. Deterministic personal-information check. A hit never reaches the model.
  const findings = detectPii(message, { schoolNames: deps.schoolNames });
  if (findings.length > 0) {
    const kinds = piiKinds(findings);
    const reply = fixedReply('pii', lang);
    await deps.logSafetyEvent(request.childId, 'pii_blocked', 'warn', { kinds });
    const quota = await deps.logTurn({
      childId: request.childId,
      childText: `[blocked: ${kinds.join(', ')}]`,
      childFlags: ['pii_blocked', ...kinds],
      tutorText: reply,
      tutorFlags: ['fixed_reply'],
      usage: null,
    });
    yield { type: 'notice', kind: 'pii', text: reply };
    yield { type: 'done', ...quota };
    return;
  }

  const storedMessage = redact(message, findings);

  // 3. Intent classifier. If it is unreachable, stop without spending the quota.
  let intent: IntentLabel;
  try {
    intent = await deps.classifyIntent(message);
  } catch {
    yield { type: 'notice', kind: 'unavailable', text: fixedReply('unavailable', lang) };
    yield { type: 'done', used: gate.used ?? null, limit: gate.limit ?? null };
    return;
  }

  const route = INTENT_ROUTES[intent];
  if (route) {
    const reply = fixedReply(route.reply, lang);
    if (route.event) {
      await deps.logSafetyEvent(request.childId, route.event.kind, route.event.severity, { intent });
    }
    const quota = await deps.logTurn({
      childId: request.childId,
      childText: storedMessage,
      childFlags: [intent],
      tutorText: reply,
      tutorFlags: ['fixed_reply'],
      usage: null,
    });
    yield { type: 'notice', kind: route.reply, text: reply };
    yield { type: 'done', ...quota };
    return;
  }

  // 4. Answer, streamed sentence by sentence, each sentence checked before it is shown.
  const history = await deps.recentTurns(request.childId);
  const controller = new AbortController();
  const buffer = new SentenceBuffer();
  const shown: string[] = [];
  let usage: Usage | null = null;
  let blockedReason: string | null = null;

  try {
    stream: for await (const event of deps.streamAnswer(
      tutorSystemPrompt(lang, ageBand),
      toModelMessages(history, storedMessage),
      controller.signal,
    )) {
      if (event.type === 'usage') {
        usage = event.usage;
        continue;
      }
      for (const sentence of buffer.push(event.text)) {
        const check = checkOutputSentence(sentence);
        if (!check.ok) {
          blockedReason = check.reason;
          controller.abort();
          break stream;
        }
        shown.push(sentence);
        yield { type: 'sentence', text: sentence };
      }
    }
    if (!blockedReason) {
      for (const sentence of buffer.flush()) {
        const check = checkOutputSentence(sentence);
        if (!check.ok) {
          blockedReason = check.reason;
          break;
        }
        shown.push(sentence);
        yield { type: 'sentence', text: sentence };
      }
    }
  } catch (error) {
    if (!blockedReason) {
      // Model failure mid-answer: withdraw what was shown, do not spend the quota.
      if (shown.length > 0) yield { type: 'replace', text: fixedReply('unavailable', lang) };
      else yield { type: 'notice', kind: 'unavailable', text: fixedReply('unavailable', lang) };
      yield { type: 'done', used: gate.used ?? null, limit: gate.limit ?? null };
      console.error('tutor stream failed', (error as Error).message);
      return;
    }
  }

  let answer = shown.join(' ');
  const tutorFlags: string[] = [intent];

  // 5. Whole-answer classifier. Fails closed: an error counts as unsafe.
  if (!blockedReason) {
    let verdict: OutputLabel;
    try {
      verdict = answer ? await deps.classifyOutput(answer) : 'unsafe';
    } catch {
      verdict = 'unsafe';
    }
    if (verdict === 'unsafe') blockedReason = answer ? 'output_classifier' : 'empty_answer';
  }

  if (blockedReason) {
    answer = fixedReply('output_replaced', lang);
    tutorFlags.push('output_blocked', blockedReason);
    await deps.logSafetyEvent(request.childId, 'output_blocked', 'warn', { reason: blockedReason });
    yield { type: 'replace', text: answer };
  }

  // 6. Store the redacted turn; the child's line counts toward today's quota.
  const quota = await deps.logTurn({
    childId: request.childId,
    childText: storedMessage,
    childFlags: [intent],
    tutorText: answer,
    tutorFlags,
    usage,
  });
  yield { type: 'done', ...quota };
}
