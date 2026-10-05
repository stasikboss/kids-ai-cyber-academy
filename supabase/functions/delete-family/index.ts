// Edge Function: delete-family
//
// POST { confirm: "delete-family" } with the owner's session token, after a TOTP
// step-up. Deletes the family, every child profile and all their data, then the
// guardians' sign-in accounts. Not reversible.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteFamily } from '../_shared/delete-family.ts';
import { bearerToken, corsHeaders, json, parseAllowedOrigins } from '../_shared/http.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('origin'), ALLOWED_ORIGINS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const token = bearerToken(request);
  if (!token) return json(401, { error: 'unauthorized' }, cors);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return json(401, { error: 'unauthorized' }, cors);

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' }, cors);
  }
  if (body.confirm !== 'delete-family') return json(400, { error: 'confirmation_required' }, cors);

  // Step 1 runs with the owner's own token, so the step-up check reads their claims.
  const asOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await deleteFamily({
    prepare: async () => {
      const { data: prepared, error: rpcError } = await asOwner.rpc('prepare_family_deletion');
      if (rpcError) throw new Error(rpcError.message);
      return prepared as { family_id: string; guardian_ids: string[] };
    },
    deleteFamily: async (familyId, actorId) => {
      const { data: removed, error: rpcError } = await service.rpc('svc_delete_family', {
        p_family: familyId,
        p_actor: actorId,
      });
      if (rpcError) throw new Error(rpcError.message);
      return removed as { guardian_ids: string[] };
    },
    deleteAuthUser: async (userId) => {
      const { error: authError } = await service.auth.admin.deleteUser(userId);
      if (authError) throw new Error(authError.message);
    },
    log: (message) => console.error(message),
  }, data.user.id);

  return json(result.status, result.body, cors);
});
