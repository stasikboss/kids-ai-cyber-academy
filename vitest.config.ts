import { defineConfig } from 'vitest/config';

// Unit tests: pure TypeScript, no network, no database.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
  },
});
