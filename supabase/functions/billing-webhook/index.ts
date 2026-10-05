// Edge Function: billing-webhook
//
// Grow calls this for the first charge (notifyUrl) and, once registered with Grow,
// for every monthly charge. Public (verify_jwt = false): the ?k= secret only filters
// noise; trust comes from looking each transaction up with Grow before anything is
// recorded.

import { handleNotification, issueInvoices, type RecordOutcome } from '../_shared/billing.ts';
import { growConfig, invoiceDeps, invoicingMode, requireEnv, rpc, service } from '../_shared/billing-env.ts';
import { constantTimeEqual } from '../_shared/gate-signature.ts';
import {
  approveTransaction, isGrowRef, nestFormEntries, notificationIds, parseNotificationBody,
  stopStandingOrder, verifyTransaction,
} from '../_shared/grow.ts';
import { json } from '../_shared/http.ts';

const WEBHOOK_SECRET = requireEnv('GROW_WEBHOOK_SECRET');
const MAX_BODY_BYTES = 64 * 1024;
const grow = growConfig();
const invoicing = invoicingMode();

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (/multipart\/form-data/i.test(type)) {
    const form = await request.formData();
    const entries: Array<[string, string]> = [];
    for (const [key, value] of form.entries()) if (typeof value === 'string') entries.push([key, value]);
    return nestFormEntries(entries);
  }
  return parseNotificationBody(type, await request.text());
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const key = new URL(request.url).searchParams.get('k') ?? '';
  if (!constantTimeEqual(key, WEBHOOK_SECRET)) return json(404, { error: 'not_found' });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { error: 'too_large' });
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  const result = await handleNotification({
    gateway: 'grow',
    invoiceWithIcount: invoicing === 'icount',
    verify: (ids) => verifyTransaction(grow, ids),
    record: (payment) => rpc<RecordOutcome>(service, 'svc_record_payment', { p: payment }),
    approve: () => approveTransaction(grow, body),
    stopStandingOrder: async (ref) => {
      if (!isGrowRef(ref)) throw new Error('stored gateway reference is incomplete');
      await stopStandingOrder(grow, ref);
    },
    issueInvoice: async (transactionId) => {
      const { failed } = await issueInvoices(invoiceDeps({ gateway: 'grow', transactionId }));
      if (failed > 0) throw new Error('invoice not issued');
    },
    log: (message) => console.error(message),
  }, notificationIds(body));

  return json(result.status, result.body);
});
