import { availableLessonIds, validateContent } from './content.ts';

const errors = validateContent();
if (errors.length > 0) {
  console.error(`Content check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Content OK. Lessons in both languages: ${availableLessonIds().join(', ')}`);
