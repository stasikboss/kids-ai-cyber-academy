/**
 * Billing flows, with every outside call injected so they are unit-tested without
 * Grow, iCount or Supabase. The Edge Functions wire in the real implementations.
 *
 *   startCheckout      parent asks to subscribe → payment page URL
 *   handleNotification Grow reports a payment → verify with Grow → record → approve,
 *                      stop any duplicate standing order, issue the invoice
 *   cancelSubscription parent cancels → stop at Grow first → then mark canceled
 *   issueInvoices      retry queue for invoices that could not be issued inline
 */

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutDeps {
  prepare(): Promise<{ checkout_id: string; amount_agorot: number; locale: 'he' | 'en' }>;
  createPage(input: { checkoutId: string; amountAgorot: number; locale: 'he' | 'en' }): Promise<{ url: string; processId: string | null }>;
  attach(checkoutId: string, processId: string | null): Promise<void>;
  log?(message: string): void;
}

const CHECKOUT_ERRORS: Record<string, number> = {
  not_a_guardian: 403,
  step_up_required: 403,
  already_subscribed: 409,
  rate_limited: 429,
  billing_unavailable: 503,
};

export async function startCheckout(deps: CheckoutDeps): Promise<Result> {
  let prepared: Awaited<ReturnType<CheckoutDeps['prepare']>>;
  try {
    prepared = await deps.prepare();
  } catch (error) {
    const code = errorCode(error);
    const status = CHECKOUT_ERRORS[code];
    if (status) return { status, body: { error: code } };
    deps.log?.(`prepare_checkout failed: ${code}`);
    return { status: 500, body: { error: 'checkout_failed' } };
  }

  let page: { url: string; processId: string | null };
  try {
    page = await deps.createPage({
      checkoutId: prepared.checkout_id,
      amountAgorot: prepared.amount_agorot,
      locale: prepared.locale,
    });
  } catch (error) {
    deps.log?.(`createPaymentProcess failed: ${errorCode(error)}`);
    return { status: 502, body: { error: 'gateway_error' } };
  }

  try {
    await deps.attach(prepared.checkout_id, page.processId);
  } catch (error) {
    // Diagnostics only; the payment still finds its family through the checkout id.
    deps.log?.(`svc_attach_checkout failed: ${errorCode(error)}`);
  }
  return { status: 200, body: { url: page.url, checkout_id: prepared.checkout_id } };
}

// ---------------------------------------------------------------------------
// Payment notification (callback for the first charge, webhook for renewals)
// ---------------------------------------------------------------------------

export interface VerifiedPayment {
  transactionId: string;
  amountAgorot: number;
  asmachta: string;
  recurringId: string | null;
  checkoutId: string | null;
  ref: Record<string, unknown>;
}

export interface RecordOutcome {
  outcome: 'applied' | 'replay' | 'duplicate' | 'amount_mismatch' | 'charged_after_cancel';
  family_id: string;
  kind: 'initial' | 'renewal';
  period_end: string | null;
  cancel_ref: Record<string, unknown> | null;
}

export interface NotificationDeps {
  gateway: 'grow';
  /** iCount issues the invoices; false when the gateway issues them itself. */
  invoiceWithIcount: boolean;
  verify(ids: { transactionId: string; transactionToken: string }): Promise<VerifiedPayment | null>;
  record(payment: Record<string, unknown>): Promise<RecordOutcome>;
  approve(): Promise<void>;
  stopStandingOrder(ref: Record<string, unknown>): Promise<void>;
  issueInvoice(transactionId: string): Promise<void>;
  log(message: string): void;
}

/** Outcomes a person must act on: refunds, or a price that does not match. */
const NEEDS_A_PERSON = new Set(['duplicate', 'amount_mismatch', 'charged_after_cancel']);

export async function handleNotification(
  deps: NotificationDeps,
  ids: { transactionId: string | null; transactionToken: string | null },
): Promise<Result> {
  if (!ids.transactionId || !ids.transactionToken) {
    return { status: 400, body: { error: 'invalid_notification' } };
  }

  // The notification is unsigned: only what Grow confirms counts.
  let verified: VerifiedPayment | null;
  try {
    verified = await deps.verify({ transactionId: ids.transactionId, transactionToken: ids.transactionToken });
  } catch (error) {
    deps.log(`billing: verification unavailable for ${ids.transactionId}: ${errorCode(error)}`);
    return { status: 502, body: { error: 'verification_unavailable' } };
  }
  if (!verified) {
    deps.log(`billing: ${ids.transactionId} is not a verified paid transaction; ignored`);
    return { status: 200, body: { ignored: 'not_verified' } };
  }

  let outcome: RecordOutcome;
  try {
    outcome = await deps.record({
      gateway: deps.gateway,
      transaction_id: verified.transactionId,
      checkout_id: verified.checkoutId,
      recurring_id: verified.recurringId,
      amount_agorot: verified.amountAgorot,
      asmachta: verified.asmachta,
      ref: verified.ref,
      invoice: deps.invoiceWithIcount,
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'unknown_payment') {
      deps.log(`billing ALERT: paid transaction ${verified.transactionId} matches no family`);
      return { status: 200, body: { ignored: 'unknown_payment' } };
    }
    deps.log(`billing: recording ${verified.transactionId} failed: ${code}`);
    return { status: 500, body: { error: 'record_failed' } };
  }

  try {
    await deps.approve();
  } catch (error) {
    deps.log(`billing: approveTransaction failed for ${verified.transactionId}: ${errorCode(error)}`);
  }

  if (outcome.outcome === 'replay') {
    return { status: 200, body: { ok: true, outcome: 'replay' } };
  }

  if (outcome.cancel_ref) {
    try {
      await deps.stopStandingOrder(outcome.cancel_ref);
    } catch (error) {
      deps.log(`billing ALERT: could not stop standing order for family ${outcome.family_id}: ${errorCode(error)}`);
    }
  }

  if (NEEDS_A_PERSON.has(outcome.outcome)) {
    deps.log(`billing ALERT: ${outcome.outcome} for family ${outcome.family_id}, transaction ${verified.transactionId}`);
  }

  if (deps.invoiceWithIcount) {
    try {
      await deps.issueInvoice(verified.transactionId);
    } catch (error) {
      deps.log(`billing: invoice for ${verified.transactionId} left for retry: ${errorCode(error)}`);
    }
  }

  return { status: 200, body: { ok: true, outcome: outcome.outcome } };
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export interface CancelDeps {
  prepare(): Promise<{ family_id: string }>;
  details(familyId: string): Promise<{ gateway: string | null; recurring_id: string | null; ref: Record<string, unknown> }>;
  stopStandingOrder(ref: Record<string, unknown>): Promise<void>;
  markCanceled(familyId: string, actorId: string): Promise<{ access_until: string | null }>;
  log?(message: string): void;
}

const CANCEL_ERRORS: Record<string, number> = {
  not_a_guardian: 403,
  step_up_required: 403,
  not_subscribed: 409,
};

export async function cancelSubscription(deps: CancelDeps, actorId: string): Promise<Result> {
  let familyId: string;
  try {
    familyId = (await deps.prepare()).family_id;
  } catch (error) {
    const code = errorCode(error);
    const status = CANCEL_ERRORS[code];
    if (status) return { status, body: { error: code } };
    deps.log?.(`prepare_cancel_subscription failed: ${code}`);
    return { status: 500, body: { error: 'cancel_failed' } };
  }

  try {
    const details = await deps.details(familyId);
    // Stop the charges first. If the gateway call fails, the plan is not marked
    // canceled, so the app never says "canceled" while the card is still charged.
    if (details.recurring_id) await deps.stopStandingOrder(details.ref);
  } catch (error) {
    deps.log?.(`billing: stopping the standing order for ${familyId} failed: ${errorCode(error)}`);
    return { status: 502, body: { error: 'gateway_error' } };
  }

  try {
    const { access_until } = await deps.markCanceled(familyId, actorId);
    return { status: 200, body: { canceled: true, access_until } };
  } catch (error) {
    deps.log?.(`billing ALERT: standing order stopped but svc_mark_canceled failed for ${familyId}: ${errorCode(error)}`);
    return { status: 500, body: { error: 'cancel_failed' } };
  }
}

// ---------------------------------------------------------------------------
// Invoice queue
// ---------------------------------------------------------------------------

export interface ClaimedPayment {
  gateway: string;
  transaction_id: string;
  kind: 'initial' | 'renewal';
  amount_agorot: number;
  received_at: string;
  attempt: number;
  locale: 'he' | 'en';
  email: string | null;
}

export interface InvoiceDeps {
  claim(): Promise<ClaimedPayment[]>;
  issue(payment: ClaimedPayment): Promise<{ documentId: string; documentUrl: string | null }>;
  record(payment: ClaimedPayment, document: { documentId: string; documentUrl: string | null }): Promise<void>;
  fail(payment: ClaimedPayment, error: string): Promise<void>;
  log(message: string): void;
}

export async function issueInvoices(deps: InvoiceDeps): Promise<{ issued: number; failed: number }> {
  let issued = 0;
  let failed = 0;
  for (const payment of await deps.claim()) {
    let document: { documentId: string; documentUrl: string | null };
    try {
      document = await deps.issue(payment);
    } catch (error) {
      failed += 1;
      deps.log(`billing: invoice for ${payment.transaction_id} failed (attempt ${payment.attempt}): ${errorCode(error)}`);
      await deps.fail(payment, errorCode(error)).catch((e) => deps.log(`billing: svc_invoice_failed: ${errorCode(e)}`));
      continue;
    }
    try {
      await deps.record(payment, document);
      issued += 1;
    } catch (error) {
      // The document exists in iCount; the lease expires and a retry would issue a
      // second one, so this needs a person rather than an automatic retry.
      failed += 1;
      deps.log(`billing ALERT: invoice ${document.documentId} issued for ${payment.transaction_id} but not recorded: ${errorCode(error)}`);
    }
  }
  return { issued, failed };
}

/** "Family plan, October 2026" in the family's language, Israel time. */
export function invoiceDescription(locale: 'he' | 'en', paidAt: string): string {
  const month = new Date(paidAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
    month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem',
  });
  return locale === 'he' ? `תוכנית משפחתית, ${month}` : `Family plan, ${month}`;
}
