// Edge Function: billing-invoices
//
// Retry queue for invoices that could not be issued when the payment arrived. Run it
// every 15 minutes from Supabase Cron with the service-role key as the bearer token.

import { issueInvoices } from '../_shared/billing.ts';
import { invoiceDeps, invoicingMode, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/billing-env.ts';
import { constantTimeEqual } from '../_shared/gate-signature.ts';
import { bearerToken, json } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!constantTimeEqual(bearerToken(request) ?? '', SUPABASE_SERVICE_ROLE_KEY)) {
    return json(401, { error: 'unauthorized' });
  }
  if (invoicingMode() !== 'icount') return json(200, { skipped: 'invoicing_by_gateway' });

  const result = await issueInvoices(invoiceDeps());
  return json(200, result);
});
