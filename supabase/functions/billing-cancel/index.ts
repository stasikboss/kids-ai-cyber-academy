// Edge Function: billing-cancel
//
// POST with a guardian's session token, after a TOTP step-up. Stops the Grow standing
// order first, then marks the plan canceled; the Family plan stays until the paid
// period ends. If Grow cannot be reached, nothing is marked canceled.

import { cancelSubscription } from '../_shared/billing.ts';
import { asUser, growConfig, rpc, service } from '../_shared/billing-env.ts';
import { isGrowRef, stopStandingOrder } from '../_shared/grow.ts';
import { bearerToken, corsHeaders, json, parseAllowedOrigins } from '../_shared/http.ts';

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
const grow = growConfig();

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('origin'), ALLOWED_ORIGINS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const token = bearerToken(request);
  if (!token) return json(401, { error: 'unauthorized' }, cors);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return json(401, { error: 'unauthorized' }, cors);
  const guardian = asUser(token);

  const result = await cancelSubscription({
    prepare: () => rpc(guardian, 'prepare_cancel_subscription'),
    details: (familyId) => rpc(service, 'svc_cancel_details', { p_family: familyId }),
    stopStandingOrder: async (ref) => {
      if (!isGrowRef(ref)) throw new Error('stored gateway reference is incomplete');
      await stopStandingOrder(grow, ref);
    },
    markCanceled: (familyId, actorId) => rpc(service, 'svc_mark_canceled', { p_family: familyId, p_actor: actorId }),
    log: (message) => console.error(message),
  }, data.user.id);

  return json(result.status, result.body, cors);
});
