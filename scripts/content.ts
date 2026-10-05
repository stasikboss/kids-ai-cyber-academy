import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { type Lang, loadCatalog } from './catalog.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const LANGS: Lang[] = ['he', 'en'];

interface Lesson {
  id: string;
  language: Lang;
  title: string;
  game: { bins: Array<{ id: string }>; items: Array<{ id: string; bin: string }> };
  quiz: Array<{ id: string; answer: number }>;
}

/**
 * Checks every lesson file against the schema, the catalog and its other-language
 * twin. A lesson ships only when both languages exist and agree on structure and
 * answers. Returns a list of problems; empty means valid.
 */
export function validateContent(): string[] {
  const errors: string[] = [];
  const catalog = loadCatalog();
  const catalogIds = new Map(catalog.lessons.map((l) => [l.id, l]));
  const schema = JSON.parse(readFileSync(root('content/schema/lesson.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

  const lessons = new Map<string, Partial<Record<Lang, Lesson>>>();

  for (const lang of LANGS) {
    const dir = root(`content/lessons/${lang}/`);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const where = `content/lessons/${lang}/${file}`;
      let data: Lesson;
      try {
        data = JSON.parse(readFileSync(`${dir}${file}`, 'utf8'));
      } catch (error) {
        errors.push(`${where}: invalid JSON (${(error as Error).message})`);
        continue;
      }
      if (!validate(data)) {
        for (const e of validate.errors ?? []) errors.push(`${where}: ${e.instancePath || '/'} ${e.message}`);
        continue;
      }
      if (`${data.id}.json` !== file) errors.push(`${where}: id ${data.id} does not match the file name`);
      if (data.language !== lang) errors.push(`${where}: language ${data.language} is in the ${lang} folder`);

      const entry = catalogIds.get(data.id);
      if (!entry) {
        errors.push(`${where}: ${data.id} is not in content/catalog.json`);
        continue;
      }
      if (entry.title[lang] !== data.title) errors.push(`${where}: title differs from the catalog`);

      const binIds = new Set(data.game.bins.map((b) => b.id));
      for (const item of data.game.items) {
        if (!binIds.has(item.bin)) errors.push(`${where}: item ${item.id} uses unknown bin ${item.bin}`);
      }
      for (const bin of binIds) {
        if (!data.game.items.some((i) => i.bin === bin)) errors.push(`${where}: bin ${bin} has no items`);
      }
      const ids = [...data.game.items.map((i) => i.id), ...data.quiz.map((q) => q.id)];
      if (new Set(ids).size !== ids.length) errors.push(`${where}: duplicate item or question ids`);

      lessons.set(data.id, { ...lessons.get(data.id), [lang]: data });
    }
  }

  // Both languages must exist and agree, so translations cannot drift apart.
  for (const [id, byLang] of lessons) {
    const he = byLang.he;
    const en = byLang.en;
    if (!he || !en) {
      errors.push(`${id}: needs both a Hebrew and an English file`);
      continue;
    }
    const shape = (l: Lesson) => JSON.stringify({
      bins: l.game.bins.map((b) => b.id),
      items: l.game.items.map((i) => [i.id, i.bin]),
      quiz: l.quiz.map((q) => [q.id, q.answer]),
    });
    if (shape(he) !== shape(en)) errors.push(`${id}: Hebrew and English differ in items, bins or answers`);
  }

  return errors;
}

/** Lesson ids that exist in both languages and pass validation. */
export function availableLessonIds(): string[] {
  const ids = (lang: Lang) => {
    const dir = root(`content/lessons/${lang}/`);
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  };
  const en = new Set(ids('en'));
  return ids('he').filter((id) => en.has(id)).sort();
}
