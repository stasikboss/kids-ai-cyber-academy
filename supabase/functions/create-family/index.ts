// Edge Function: create-family
//
// Reachable only through the geo-gate Worker (workers/geo-gate), which signs each
// request with the visitor's country. No child data can exist before a family does,
// so this is where the Israel-only launch is enforced.
//
// POST { locale: 'he' | 'en' } with the parent's session token, via the Worker.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGate } from '../_shared/gate-signature.ts';
import { bearerToken, json } from '../_shared/http.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const GATE_SECRET = requireEnv('GATE_SECRET');
const ALLOWED_COUNTRIES = (Deno.env.get('ALLOWED_COUNTRIES') ?? 'IL')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const gate = await verifyGate(GATE_SECRET, request.headers, { allowedCountries: ALLOWED_COUNTRIES });
  if (!gate.ok) {
    console.warn('create-family refused by geo gate', gate.reason);
    return json(403, { error: 'geo_gate', reason: gate.reason });
  }

  const token = bearerToken(request);
  if (!token) return json(401, { error: 'unauthorized' });
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) return json(401, { error: 'unauthorized' });

  let locale = 'he';
  try {
    const body = await request.json() as { locale?: unknown };
    if (body.locale === 'en') locale = 'en';
  } catch {
    // An empty body keeps the Hebrew default.
  }

  const { data: familyId, error: rpcError } = await service.rpc('svc_create_family', {
    p_user: data.user.id,
    p_locale: locale,
  });
  if (rpcError) {
    console.error('svc_create_family failed', rpcError.message);
    return json(500, { error: 'create_failed' });
  }

  return json(200, { family_id: familyId });
});
