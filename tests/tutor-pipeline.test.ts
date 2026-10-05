import { describe, expect, it } from 'vitest';
import type { MessageParam, StreamEvent } from '../supabase/functions/_shared/anthropic.ts';
import { fixedReply, type IntentLabel, type OutputLabel } from '../supabase/functions/_shared/prompts.ts';
import {
  type GateResult, type LogTurnInput, runTutorTurn, type TutorDeps, type TutorEvent, toModelMessages, type Turn,
} from '../supabase/functions/_shared/tutor-pipeline.ts';

interface FakeOptions {
  gate?: Partial<GateResult>;
  intent?: IntentLabel | Error;
  answer?: string[] | Error;
  failAfterChunks?: number;
  verdict?: OutputLabel | Error;
  history?: Turn[];
}

function fakeDeps(options: FakeOptions = {}) {
  const calls = {
    loggedTurns: [] as LogTurnInput[],
    safetyEvents: [] as Array<{ kind: string; severity: string; detail: Record<string, unknown> }>,
    modelMessages: [] as MessageParam[][],
    classifiedIntent: [] as string[],
    aborted: false,
  };

  const deps: TutorDeps = {
    async gate() {
      return { allowed: true, used: 0, limit: 5, language: 'en', age_band: '8-9', ...options.gate };
    },
    async recentTurns() {
      return options.history ?? [];
    },
    async logTurn(input) {
      calls.loggedTurns.push(input);
      return { used: 1, limit: 5 };
    },
    async logSafetyEvent(_child, kind, severity, detail) {
      calls.safetyEvents.push({ kind, severity, detail });
    },
    async classifyIntent(message) {
      calls.classifiedIntent.push(message);
      if (options.intent instanceof Error) throw options.intent;
      return options.intent ?? 'on_topic';
    },
    async *streamAnswer(_system, messages, signal): AsyncIterable<StreamEvent> {
      calls.modelMessages.push(messages);
      signal.addEventListener('abort', () => { calls.aborted = true; });
      if (options.answer instanceof Error) throw options.answer;
      let sent = 0;
      for (const chunk of options.answer ?? ['AI learns from ', 'examples. ', 'Like you!']) {
        if (options.failAfterChunks !== undefined && sent === options.failAfterChunks) {
          throw new Error('connection reset');
        }
        yield { type: 'text', text: chunk };
        sent++;
      }
      yield { type: 'usage', usage: { inputTokens: 900, outputTokens: 20 } };
    },
    async classifyOutput() {
      if (options.verdict instanceof Error) throw options.verdict;
      return options.verdict ?? 'safe';
    },
  };
  return { deps, calls };
}

async function collect(deps: TutorDeps, message: string): Promise<TutorEvent[]> {
  const events: TutorEvent[] = [];
  for await (const event of runTutorTurn(deps, { userId: 'u', childId: 'c', message, fallbackLang: 'he' })) {
    events.push(event);
  }
  return events;
}

describe('runTutorTurn', () => {
  it('streams a checked answer and stores the turn', async () => {
    const { deps, calls } = fakeDeps();
    const events = await collect(deps, 'How does AI learn?');

    expect(events).toEqual([
      { type: 'sentence', text: 'AI learns from examples.' },
      { type: 'sentence', text: 'Like you!' },
      { type: 'done', used: 1, limit: 5 },
    ]);
    expect(calls.loggedTurns).toHaveLength(1);
    expect(calls.loggedTurns[0]).toMatchObject({
      childText: 'How does AI learn?',
      tutorText: 'AI learns from examples. Like you!',
      tutorFlags: ['on_topic'],
      usage: { inputTokens: 900, outputTokens: 20 },
    });
    expect(calls.safetyEvents).toEqual([]);
  });

  it('blocks personal information before any model call', async () => {
    const { deps, calls } = fakeDeps();
    const events = await collect(deps, 'my phone is 050-1234567, is that safe?');

    expect(events[0]).toEqual({ type: 'notice', kind: 'pii', text: fixedReply('pii', 'en') });
    expect(calls.classifiedIntent).toEqual([]);
    expect(calls.modelMessages).toEqual([]);
    expect(calls.safetyEvents).toEqual([{ kind: 'pii_blocked', severity: 'warn', detail: { kinds: ['phone'] } }]);
    expect(calls.loggedTurns[0]!.childText).toBe('[blocked: phone]');
    expect(JSON.stringify(calls.loggedTurns)).not.toContain('1234567');
  });

  it('answers distress with the fixed support reply and a high-severity alert', async () => {
    const { deps, calls } = fakeDeps({ intent: 'distress' });
    const events = await collect(deps, 'everyone at school hates me');

    expect(events[0]).toEqual({ type: 'notice', kind: 'support', text: fixedReply('support', 'en') });
    expect(calls.modelMessages).toEqual([]);
    expect(calls.safetyEvents[0]).toMatchObject({ kind: 'distress', severity: 'high' });
  });

  it.each([
    ['unsafe', 'refusal', 'unsafe_request'],
    ['manipulation', 'manipulation', 'manipulation'],
  ] as const)('routes %s to the fixed %s reply', async (intent, reply, kind) => {
    const { deps, calls } = fakeDeps({ intent });
    const events = await collect(deps, 'something');
    expect(events[0]).toMatchObject({ type: 'notice', kind: reply });
    expect(calls.safetyEvents[0]!.kind).toBe(kind);
    expect(calls.modelMessages).toEqual([]);
  });

  it('redirects off-topic questions without a model answer or a safety event', async () => {
    const { deps, calls } = fakeDeps({ intent: 'off_topic' });
    const events = await collect(deps, 'who won the football game?');
    expect(events[0]).toMatchObject({ type: 'notice', kind: 'off_topic' });
    expect(calls.safetyEvents).toEqual([]);
    expect(calls.modelMessages).toEqual([]);
  });

  it('stops the stream and replaces the answer when a sentence fails the filter', async () => {
    const { deps, calls } = fakeDeps({ answer: ['Good question. ', 'Visit www.example.com for more. ', 'Bye.'] });
    const events = await collect(deps, 'Where can I learn more?');

    expect(events).toEqual([
      { type: 'sentence', text: 'Good question.' },
      { type: 'replace', text: fixedReply('output_replaced', 'en') },
      { type: 'done', used: 1, limit: 5 },
    ]);
    expect(calls.aborted).toBe(true);
    expect(calls.safetyEvents[0]).toMatchObject({ kind: 'output_blocked', detail: { reason: 'link' } });
    expect(calls.loggedTurns[0]!.tutorText).toBe(fixedReply('output_replaced', 'en'));
  });

  it('replaces the answer when the output classifier says unsafe, and fails closed on errors', async () => {
    for (const verdict of ['unsafe', new Error('timeout')] as const) {
      const { deps, calls } = fakeDeps({ verdict });
      const events = await collect(deps, 'Tell me about AI');
      expect(events.at(-2)).toEqual({ type: 'replace', text: fixedReply('output_replaced', 'en') });
      expect(calls.loggedTurns[0]!.tutorFlags).toContain('output_blocked');
    }
  });

  it('does not spend the quota when the model is unreachable', async () => {
    const intentDown = fakeDeps({ intent: new Error('503') });
    expect((await collect(intentDown.deps, 'What is AI?'))[0]).toMatchObject({ type: 'notice', kind: 'unavailable' });
    expect(intentDown.calls.loggedTurns).toEqual([]);

    const midStream = fakeDeps({ failAfterChunks: 2 });
    const events = await collect(midStream.deps, 'What is AI?');
    expect(events).toContainEqual({ type: 'replace', text: fixedReply('unavailable', 'en') });
    expect(midStream.calls.loggedTurns).toEqual([]);
  });

  it('explains gate refusals in the child\'s language', async () => {
    const { deps, calls } = fakeDeps({ gate: { allowed: false, reason: 'quota_reached', language: 'he', used: 5, limit: 5 } });
    const events = await collect(deps, 'What is AI?');
    expect(events).toEqual([
      { type: 'notice', kind: 'quota_reached', text: fixedReply('quota_reached', 'he') },
      { type: 'done', used: 5, limit: 5 },
    ]);
    expect(calls.classifiedIntent).toEqual([]);
  });

  it('rejects empty and over-long messages', async () => {
    const { deps } = fakeDeps();
    expect((await collect(deps, '   '))[0]).toMatchObject({ kind: 'invalid_message' });
    expect((await collect(deps, 'x'.repeat(501)))[0]).toMatchObject({ kind: 'invalid_message' });
  });
});

describe('toModelMessages', () => {
  it('alternates roles, starts with the user and ends with the new message', () => {
    const messages = toModelMessages(
      [
        { role: 'tutor', text_redacted: 'stray greeting' },
        { role: 'child', text_redacted: 'q1' },
        { role: 'tutor', text_redacted: 'a1' },
        { role: 'child', text_redacted: 'q2 (blocked, no answer stored)' },
      ],
      'q3',
    );
    expect(messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q3' },
    ]);
  });
});
