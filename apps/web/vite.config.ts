import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const contentDir = fileURLToPath(new URL('../../content', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Lesson JSON lives in /content at the repo root, shared with the validator.
    fs: { allow: ['.', contentDir] },
    // Local geo-gate Worker (`npx wrangler dev --env dev` in workers/geo-gate).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Framework and Supabase client change rarely; cache them apart from app code.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
