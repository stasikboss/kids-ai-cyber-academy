import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogToSeedSql, loadCatalog } from './catalog.ts';

const seedPath = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));
writeFileSync(seedPath, catalogToSeedSql(loadCatalog()));
console.log(`Wrote ${seedPath}`);
