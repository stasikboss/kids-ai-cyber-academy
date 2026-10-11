// Cloudflare Pages Function: the Israel-only gate in front of family creation, served
// same-origin at /api/create-family on the Pages site. It reuses the geo-gate Worker's
// handler, so a custom domain and a separate Worker are not needed for the free launch.
// Secrets and variables (wrangler pages secret): GATE_SECRET, SUPABASE_ANON_KEY,
// SUPABASE_FUNCTIONS_URL, ALLOWED_COUNTRIES, ENVIRONMENT=production.

import { type Env, handle, visitorCountry } from '../../../../workers/geo-gate/src/index.ts';

export const onRequest: PagesFunction<Env> = (context) => {
  const cf = (context.request as Request & { cf?: { country?: string } }).cf;
  return handle(context.request, context.env, visitorCountry(context.env, cf?.country));
};
