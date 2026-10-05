import { describe, expect, it } from 'vitest';
import {
  cancelSubscription, type CancelDeps, type CheckoutDeps, type ClaimedPayment, handleNotification,
  invoiceDescription, issueInvoices, type InvoiceDeps, type NotificationDeps, type RecordOutcome,
  startCheckout, type VerifiedPayment,
} from '../supabase/functions/_shared/billing.ts';

const VERIFIED: VerifiedPayment = {
  transactionId: 't1', amountAgorot: 2990, asmachta: 'a1', recurringId: 'dd-1', checkoutId: 'chk-1',
  ref: { transaction_id: 't1', transaction_token: 'tok', asmachta: 'a1' },
};

function notification(overrides: Partial<NotificationDeps> = {}, outcome: Partial<RecordOutcome> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const deps: NotificationDeps = {
    gateway: 'grow',
    invoiceWithIcount: true,
    verify: async () => { calls.push('verify'); return VERIFIED; },
    record: async (payment) => {
      calls.push(`record:${payment.amount_agorot}`);
      return { outcome: 'applied', family_id: 'fam', kind: 'initial', period_end: null, cancel_ref: null, ...outcome };
    },
    approve: async () => { calls.push('approve'); },
    stopStandingOrder: async (ref) => { calls.push(`stop:${String(ref.transaction_token)}`); },
    issueInvoice: async (txn) => { calls.push(`invoice:${txn}`); },
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { deps, calls, logs };
}

const IDS = { transactionId: 't1', transactionToken: 'tok' };

describe('payment notification', () => {
  it('verifies with the gateway before recording, then approves and invoices', async () => {
    const { deps, calls } = notification();
    const result = await handleNotification(deps, IDS);
    expect(result).toEqual({ status: 200, body: { ok: true, outcome: 'applied' } });
    expect(calls).toEqual(['verify', 'record:2990', 'approve', 'invoice:t1']);
  });

  it('records only verified values, never what the notification claimed', async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const { deps } = notification({
      record: async (payment) => {
        recorded.push(payment);
        return { outcome: 'applied', family_id: 'fam', kind: 'initial', period_end: null, cancel_ref: null };
      },
    });
    await handleNotification(deps, IDS);
    expect(recorded[0]).toEqual({
      gateway: 'grow', transaction_id: 't1', checkout_id: 'chk-1', recurring_id: 'dd-1', amount_agorot: 2990,
      asmachta: 'a1', ref: VERIFIED.ref, invoice: true,
    });
  });

  it('ignores a notification the gateway does not confirm as paid', async () => {
    const { deps, calls } = notification({ verify: async () => null });
    expect(await handleNotification(deps, IDS)).toEqual({ status: 200, body: { ignored: 'not_verified' } });
    expect(calls).toEqual([]);
  });

  it('asks for a retry when the gateway cannot be reached', async () => {
    const { deps, calls } = notification({ verify: async () => { throw new Error('timeout'); } });
    expect((await handleNotification(deps, IDS)).status).toBe(502);
    expect(calls).toEqual([]);
  });

  it('rejects a notification without ids', async () => {
    const { deps } = notification();
    expect((await handleNotification(deps, { transactionId: 't1', transactionToken: null })).status).toBe(400);
  });

  it('does not invoice or stop anything twice on a replay', async () => {
    const { deps, calls } = notification({}, { outcome: 'replay' });
    expect(await handleNotification(deps, IDS)).toEqual({ status: 200, body: { ok: true, outcome: 'replay' } });
    expect(calls).toEqual(['verify', 'record:2990', 'approve']);
  });

  it('stops a duplicate standing order and raises an alert for the refund', async () => {
    const { deps, calls, logs } = notification({}, { outcome: 'duplicate', cancel_ref: { transaction_token: 'second' } });
    await handleNotification(deps, IDS);
    expect(calls).toContain('stop:second');
    expect(logs.some((l) => l.includes('ALERT: duplicate'))).toBe(true);
  });

  it('stops answering 200 only after recording; invoice and approval failures do not undo a payment', async () => {
    const { deps, logs } = notification({
      approve: async () => { throw new Error('approve down'); },
      issueInvoice: async () => { throw new Error('icount down'); },
    });
    expect((await handleNotification(deps, IDS)).status).toBe(200);
    expect(logs.join('\n')).toMatch(/approveTransaction failed[\s\S]*left for retry/);
  });

  it('answers 200 and raises an alert for a paid transaction that matches no family', async () => {
    const { deps, logs } = notification({ record: async () => { throw new Error('unknown_payment'); } });
    expect(await handleNotification(deps, IDS)).toEqual({ status: 200, body: { ignored: 'unknown_payment' } });
    expect(logs[0]).toMatch(/ALERT/);
  });

  it('leaves invoicing to the gateway when configured so', async () => {
    const { deps, calls } = notification({ invoiceWithIcount: false });
    await handleNotification(deps, IDS);
    expect(calls).not.toContain('invoice:t1');
  });
});

describe('checkout', () => {
  const base: CheckoutDeps = {
    prepare: async () => ({ checkout_id: 'chk', amount_agorot: 2990, locale: 'he' }),
    createPage: async () => ({ url: 'https://pay.example/abc', processId: 'p1' }),
    attach: async () => {},
  };

  it('returns the payment page for the server-set amount', async () => {
    const seen: number[] = [];
    const result = await startCheckout({ ...base, createPage: async (input) => { seen.push(input.amountAgorot); return { url: 'https://pay.example/abc', processId: null }; } });
    expect(result).toEqual({ status: 200, body: { url: 'https://pay.example/abc', checkout_id: 'chk' } });
    expect(seen).toEqual([2990]);
  });

  it.each([
    ['step_up_required', 403], ['already_subscribed', 409], ['rate_limited', 429], ['billing_unavailable', 503], ['boom', 500],
  ])('maps %s to %i', async (code, status) => {
    const result = await startCheckout({ ...base, prepare: async () => { throw new Error(code); } });
    expect(result.status).toBe(status);
  });

  it('reports a gateway failure as 502', async () => {
    const result = await startCheckout({ ...base, createPage: async () => { throw new Error('down'); } });
    expect(result).toEqual({ status: 502, body: { error: 'gateway_error' } });
  });
});

describe('cancellation', () => {
  function cancel(overrides: Partial<CancelDeps> = {}) {
    const calls: string[] = [];
    const deps: CancelDeps = {
      prepare: async () => { calls.push('prepare'); return { family_id: 'fam' }; },
      details: async () => ({ gateway: 'grow', recurring_id: 'dd-1', ref: { transaction_token: 'tok' } }),
      stopStandingOrder: async () => { calls.push('stop'); },
      markCanceled: async () => { calls.push('mark'); return { access_until: '2026-11-05T00:00:00Z' }; },
      ...overrides,
    };
    return { deps, calls };
  }

  it('stops the charges at the gateway before marking the plan canceled', async () => {
    const { deps, calls } = cancel();
    expect(await cancelSubscription(deps, 'owner')).toEqual({
      status: 200, body: { canceled: true, access_until: '2026-11-05T00:00:00Z' },
    });
    expect(calls).toEqual(['prepare', 'stop', 'mark']);
  });

  it('never says canceled when the gateway could not stop the charges', async () => {
    const { deps, calls } = cancel({ stopStandingOrder: async () => { throw new Error('down'); } });
    expect(await cancelSubscription(deps, 'owner')).toEqual({ status: 502, body: { error: 'gateway_error' } });
    expect(calls).toEqual(['prepare']);
  });

  it('cancels a complimentary plan without calling the gateway', async () => {
    const { deps, calls } = cancel({ details: async () => ({ gateway: null, recurring_id: null, ref: {} }) });
    expect((await cancelSubscription(deps, 'owner')).status).toBe(200);
    expect(calls).toEqual(['prepare', 'mark']);
  });

  it.each([['step_up_required', 403], ['not_subscribed', 409]])('maps %s to %i', async (code, status) => {
    const { deps } = cancel({ prepare: async () => { throw new Error(code); } });
    expect((await cancelSubscription(deps, 'owner')).status).toBe(status);
  });
});

describe('invoice queue', () => {
  const payment = (id: string): ClaimedPayment => ({
    gateway: 'grow', transaction_id: id, kind: 'renewal', amount_agorot: 2990,
    received_at: '2026-10-05T10:00:00Z', attempt: 1, locale: 'he', email: 'p@example.test',
  });

  it('records what was issued and backs off what failed', async () => {
    const recorded: string[] = [];
    const failed: string[] = [];
    const deps: InvoiceDeps = {
      claim: async () => [payment('ok'), payment('bad')],
      issue: async (p) => {
        if (p.transaction_id === 'bad') throw new Error('icount said no');
        return { documentId: 'D1', documentUrl: null };
      },
      record: async (p, doc) => { recorded.push(`${p.transaction_id}:${doc.documentId}`); },
      fail: async (p, error) => { failed.push(`${p.transaction_id}:${error}`); },
      log: () => {},
    };
    expect(await issueInvoices(deps)).toEqual({ issued: 1, failed: 1 });
    expect(recorded).toEqual(['ok:D1']);
    expect(failed).toEqual(['bad:icount said no']);
  });

  it('describes the month in the family\'s language, Israel time', () => {
    // 22:30 UTC on 31 October is already 1 November in Israel.
    expect(invoiceDescription('en', '2026-10-31T22:30:00Z')).toBe('Family plan, November 2026');
    expect(invoiceDescription('he', '2026-10-05T10:00:00Z')).toBe('תוכנית משפחתית, אוקטובר 2026');
  });
});
