import { defineConfig } from 'vitest/config';

// Database tests: need DATABASE_URL pointing at a disposable Postgres 15+ server
// (superuser). The harness creates a fresh database per run and drops it afterwards.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['supabase/tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
