import { describe, expect, it } from 'vitest';
import { catalogToSeedSql, loadCatalog } from '../scripts/catalog.ts';
import { availableLessonIds, validateContent } from '../scripts/content.ts';

describe('content', () => {
  it('passes schema, catalog and bilingual parity checks', () => {
    expect(validateContent()).toEqual([]);
  });

  it('ships the Sprint 0 lessons in both languages', () => {
    expect(availableLessonIds()).toEqual(['ai-01', 'cyber-02']);
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
