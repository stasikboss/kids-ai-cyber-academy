import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { catalogToSeedSql, loadCatalog } from '../../scripts/catalog.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Creates a throwaway database, loads the Supabase stub, every migration in order and
 * the lesson catalog, then hands its URL to the tests. Dropped again on teardown.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
  const dbName = `kca_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const testUrl = url.toString();

  const db = new pg.Client({ connectionString: testUrl });
  await db.connect();
  try {
    await db.query(readFileSync(here('./supabase-stub.sql'), 'utf8'));

    const migrationsDir = here('../migrations/');
    const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of migrations) {
      try {
        await db.query(readFileSync(`${migrationsDir}${file}`, 'utf8'));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }

    await db.query(catalogToSeedSql(loadCatalog()));
  } finally {
    await db.end();
  }

  project.provide('testDatabaseUrl', testUrl);

  return async () => {
    const cleanup = new pg.Client({ connectionString: adminUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${dbName} with (force)`);
    await cleanup.end();
  };
}
