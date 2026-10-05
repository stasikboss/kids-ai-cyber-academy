import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type EvalLayer = 'pii' | 'pii_allow' | 'intent' | 'output';

export interface EvalCase {
  id: string;
  lang: 'he' | 'en';
  layer: EvalLayer;
  text: string;
  expect: string;
}

export function loadCases(file = 'tutor-eval-v1.jsonl'): EvalCase[] {
  const path = fileURLToPath(new URL(`./${file}`, import.meta.url));
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line) as EvalCase;
      } catch {
        throw new Error(`${file}:${i + 1} is not valid JSON`);
      }
    });
}
