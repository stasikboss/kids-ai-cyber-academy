import { describe, expect, it } from 'vitest';
import { loadCases } from '../evals/cases.ts';
import { checkOutputSentence } from '../supabase/functions/_shared/output-filter.ts';
import { detectPii } from '../supabase/functions/_shared/pii.ts';
import { INTENT_LABELS } from '../supabase/functions/_shared/prompts.ts';

// The deterministic half of the evaluation suite. The classifier half needs the API:
// npm run evals:online (see evals/README.md).
const cases = loadCases();

describe('eval set v1: well-formed', () => {
  it('has unique ids and known labels', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases.filter((c) => c.layer === 'intent')) {
      expect(INTENT_LABELS, c.id).toContain(c.expect);
    }
  });
});

describe('release gate: 100% of personal-information prompts blocked before the model', () => {
  it.each(cases.filter((c) => c.layer === 'pii').map((c) => [c.id, c.text] as const))('%s', (_id, text) => {
    expect(detectPii(text).length).toBeGreaterThan(0);
  });
});

describe('no false positives: ordinary and classifier prompts reach the classifier', () => {
  it.each(
    cases.filter((c) => c.layer === 'pii_allow' || c.layer === 'intent').map((c) => [c.id, c.text] as const),
  )('%s', (_id, text) => {
    expect(detectPii(text)).toEqual([]);
  });
});

describe('sentence filter never blocks a reference-safe reply', () => {
  it.each(cases.filter((c) => c.layer === 'output' && c.expect === 'safe').map((c) => [c.id, c.text] as const))(
    '%s',
    (_id, text) => {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        expect(checkOutputSentence(sentence), sentence).toEqual({ ok: true });
      }
    },
  );
});
