import { AI_LITERACY } from '../content/source/ai-literacy.ts';
import { AI_SECURITY } from '../content/source/ai-security.ts';
import { CYBER_SAFETY } from '../content/source/cyber-safety.ts';
import type { SourceLesson } from '../content/source/types.ts';
import { type Lang, loadCatalog } from './catalog.ts';

export const SOURCE_LESSONS: SourceLesson[] = [...AI_LITERACY, ...CYBER_SAFETY, ...AI_SECURITY];
const LANGS: Lang[] = ['he', 'en'];

const q = (value: string | number) => JSON.stringify(value);

/**
 * Writes one language of a lesson as JSON in the repo's reviewed layout: one line per
 * intro card, bins and options inline, items and questions expanded. Keeping the layout
 * stable keeps translation diffs small and readable.
 */
export function renderLesson(lesson: SourceLesson, lang: Lang, title: string): string {
  const { game } = lesson;
  const lines = [
    '{',
    `  "$schema": "../../schema/lesson.schema.json",`,
    `  "id": ${q(lesson.id)},`,
    `  "version": ${lesson.version},`,
    `  "language": ${q(lang)},`,
    `  "title": ${q(title)},`,
    '  "intro": [',
    lesson.intro.map((p) => `    ${q(p[lang])}`).join(',\n'),
    '  ],',
    '  "game": {',
    '    "type": "sort",',
    `    "prompt": ${q(game.prompt[lang])},`,
    ...(game.practiceNotice ? [`    "practiceNotice": ${q(game.practiceNotice[lang])},`] : []),
    '    "bins": [',
    game.bins.map((b) => `      { "id": ${q(b.id)}, "label": ${q(b.label[lang])} }`).join(',\n'),
    '    ],',
    '    "items": [',
    game.items.map((i) => [
      '      {',
      `        "id": ${q(i.id)},`,
      `        "text": ${q(i.text[lang])},`,
      `        "bin": ${q(i.bin)},`,
      `        "explain": ${q(i.explain[lang])}`,
      '      }',
    ].join('\n')).join(',\n'),
    '    ]',
    '  },',
    '  "quiz": [',
    lesson.quiz.map((x) => [
      '    {',
      `      "id": ${q(x.id)},`,
      `      "question": ${q(x.question[lang])},`,
      `      "options": [${x.options[lang].map(q).join(', ')}],`,
      `      "answer": ${x.answer},`,
      `      "explain": ${q(x.explain[lang])}`,
      '    }',
    ].join('\n')).join(',\n'),
    '  ],',
    `  "summary": ${q(lesson.summary[lang])}`,
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

/** Every generated lesson file, keyed by its path relative to the repo root. */
export function renderAllLessons(): Map<string, string> {
  const catalog = new Map(loadCatalog().lessons.map((l) => [l.id, l]));
  const files = new Map<string, string>();
  for (const lesson of SOURCE_LESSONS) {
    const entry = catalog.get(lesson.id);
    if (!entry) throw new Error(`${lesson.id} is in content/source but not in content/catalog.json`);
    if (files.has(`content/lessons/he/${lesson.id}.json`)) throw new Error(`${lesson.id} is defined twice`);
    for (const lang of LANGS) {
      files.set(`content/lessons/${lang}/${lesson.id}.json`, renderLesson(lesson, lang, entry.title[lang]));
    }
  }
  return files;
}
