import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogToSeedSql, loadCatalog } from '../scripts/catalog.ts';
import { availableLessonIds, validateContent } from '../scripts/content.ts';
import { renderAllLessons, SOURCE_LESSONS } from '../scripts/lessons.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

describe('content', () => {
  it('passes schema, catalog and bilingual parity checks', () => {
    expect(validateContent()).toEqual([]);
  });

  it('ships every catalog lesson in both languages', () => {
    expect(availableLessonIds()).toEqual(loadCatalog().lessons.map((l) => l.id).sort());
  });

  it('keeps the committed lesson JSON in sync with content/source (run npm run build:lessons)', () => {
    for (const [path, text] of renderAllLessons()) {
      expect(readFileSync(root(path), 'utf8'), path).toBe(text);
    }
  });

  it('varies quiz answers and keeps choices distinct', () => {
    for (const lesson of SOURCE_LESSONS) {
      expect(new Set(lesson.quiz.map((q) => q.answer)).size, lesson.id).toBeGreaterThan(1);
      for (const q of lesson.quiz) {
        for (const lang of ['he', 'en'] as const) {
          expect(new Set(q.options[lang]).size, `${lesson.id}/${q.id}/${lang}`).toBe(3);
        }
      }
      const texts = lesson.game.items.map((i) => i.text.en);
      expect(new Set(texts).size, lesson.id).toBe(texts.length);
    }
  });

  it('uses the Hebrew geresh, not an ASCII apostrophe, inside Hebrew words', () => {
    const asciiGeresh = /[\u05D0-\u05EA]'[\u05D0-\u05EA]/;
    for (const lesson of loadCatalog().lessons) {
      expect(asciiGeresh.test(lesson.title.he), lesson.id).toBe(false);
    }
    for (const lesson of SOURCE_LESSONS) {
      const hebrew: string[] = [];
      JSON.stringify(lesson, (key, value) => {
        if (key === 'he') hebrew.push(...(Array.isArray(value) ? value : [value]));
        return value;
      });
      for (const text of hebrew) expect(asciiGeresh.test(text), `${lesson.id}: ${text}`).toBe(false);
    }
  });

  it('keeps the catalog consistent', () => {
    const catalog = loadCatalog();
    const ids = catalog.lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const track of catalog.tracks) {
      const positions = catalog.lessons.filter((l) => l.track === track.id).map((l) => l.position).sort((a, b) => a - b);
      expect(positions, track.id).toEqual(positions.map((_, i) => i + 1));
    }
  });

  it('generates an idempotent seed that escapes quotes', () => {
    const sql = catalogToSeedSql({
      tracks: [{ id: 'cyber_safety', title: { he: 'x', en: 'x' }, plan: 'free', minAgeBand: '8-9' }],
      lessons: [{ id: 'cyber-01', track: 'cyber_safety', position: 1, title: { he: 'x', en: "it's" } }],
    });
    expect(sql).toContain("('cyber-01', 'cyber_safety', 1, '8-9', 'free')");
    expect(sql).toContain('on conflict (id) do update');
  });
});
