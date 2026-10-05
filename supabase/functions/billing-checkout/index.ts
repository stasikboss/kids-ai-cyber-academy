// Edge Function: billing-checkout
//
// POST with a guardian's session token, after a TOTP step-up. Starts a Family plan
// checkout and returns Grow's payment page URL ({url, checkout_id}). The server sets
// the amount; the browser only asks to start.

import { startCheckout } from '../_shared/billing.ts';
import { asUser, growConfig, requireEnv, rpc, service } from '../_shared/billing-env.ts';
import { createPaymentPage } from '../_shared/grow.ts';
import { bearerToken, corsHeaders, json, parseAllowedOrigins } from '../_shared/http.ts';

const APP_URL = requireEnv('APP_URL').replace(/\/$/, '');
const WEBHOOK_URL = `${requireEnv('SUPABASE_URL')}/functions/v1/billing-webhook?k=${encodeURIComponent(requireEnv('GROW_WEBHOOK_SECRET'))}`;
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
const grow = growConfig();

const DESCRIPTION = { he: 'תוכנית משפחתית, חיוב חודשי', en: 'Family plan, monthly' } as const;

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('origin'), ALLOWED_ORIGINS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const token = bearerToken(request);
  if (!token) return json(401, { error: 'unauthorized' }, cors);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return json(401, { error: 'unauthorized' }, cors);
  const guardian = asUser(token);

  const result = await startCheckout({
    prepare: () => rpc(guardian, 'prepare_checkout'),
    createPage: ({ checkoutId, amountAgorot, locale }) => createPaymentPage(grow, {
      amountAgorot,
      description: DESCRIPTION[locale],
      successUrl: `${APP_URL}/parent/plan?checkout=${checkoutId}`,
      cancelUrl: `${APP_URL}/parent/plan`,
      notifyUrl: WEBHOOK_URL,
      checkoutId,
      email: data.user.email,
    }),
    attach: async (checkoutId, processId) => {
      await rpc(service, 'svc_attach_checkout', { p_checkout: checkoutId, p_process_id: processId });
    },
    log: (message) => console.error(message),
  });

  return json(result.status, result.body, cors);
});
