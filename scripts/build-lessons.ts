import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAllLessons } from './lessons.ts';

// Regenerates content/lessons/<lang>/<id>.json from content/source/*.ts.
// tests/content.test.ts fails if the committed JSON and the source disagree.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = renderAllLessons();
for (const [path, text] of files) {
  mkdirSync(dirname(`${root}${path}`), { recursive: true });
  writeFileSync(`${root}${path}`, text);
}
console.log(`Wrote ${files.size} lesson files.`);
