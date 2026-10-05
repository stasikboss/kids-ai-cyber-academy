/**
 * Lesson source format. Each lesson is written once with Hebrew and English side by
 * side, so ids, bins and answers are shared and the two languages cannot drift apart.
 * `npm run build:lessons` turns these into content/lessons/<lang>/<id>.json; titles,
 * track, order, plan and age band come from content/catalog.json.
 */
export interface Bilingual {
  he: string;
  en: string;
}

export type Three = [string, string, string];

export interface SourceLesson {
  id: string;
  /** Bump when the lesson changes in a way a returning child should notice. */
  version: number;
  /** One story card per paragraph (1–4). */
  intro: Bilingual[];
  game: {
    prompt: Bilingual;
    /** Shown above drill content that imitates real messages. */
    practiceNotice?: Bilingual;
    bins: Array<{ id: string; label: Bilingual }>;
    items: Array<{ id: string; bin: string; text: Bilingual; explain: Bilingual }>;
  };
  /** Exactly three questions; the score is how many are right first time. */
  quiz: Array<{
    id: string;
    answer: 0 | 1 | 2;
    question: Bilingual;
    options: { he: Three; en: Three };
    explain: Bilingual;
  }>;
  summary: Bilingual;
}
