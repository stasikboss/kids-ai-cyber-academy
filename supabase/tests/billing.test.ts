import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asAdmin, asServiceRole, asUser, connect, createFamily, createUser,
  type Db, expectFailure, inTransaction,
} from './helpers.ts';

let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

const PRICE = 2990;

/** The service launches free (price 0); billing tests put the plan on sale first. */
async function putOnSale(): Promise<void> {
  await asAdmin(db);
  await db.query(`update public.plan_limits set monthly_price_agorot = $1 where plan = 'family'`, [PRICE]);
}

async function startCheckout(ownerId: string): Promise<string> {
  await putOnSale();
  await asUser(db, ownerId, { totpSecondsAgo: 20 });
  const { rows } = await db.query(`select public.prepare_checkout() as c`);
  return rows[0].c.checkout_id as string;
}

async function recordPayment(payment: Record<string, unknown>) {
  await asServiceRole(db);
  const { rows } = await db.query(`select public.svc_record_payment($1::jsonb) as r`, [JSON.stringify({
    gateway: 'grow', amount_agorot: PRICE, ref: { transaction_token: 'tok' }, ...payment,
  })]);
  return rows[0].r;
}

async function subscription(familyId: string) {
  await asAdmin(db);
  const { rows } = await db.query(
    `select plan, status, gateway_recurring_id, recurring_amount_agorot, current_period_end,
            app.family_plan(family_id) as effective, app.billing_phase(family_id) as phase
       from public.subscriptions where family_id = $1`, [familyId]);
  return rows[0];
}

async function shiftPeriodEnd(familyId: string, sql: string) {
  await asAdmin(db);
  await db.query(`update public.subscriptions set current_period_end = ${sql} where family_id = $1`, [familyId]);
}

describe('entitlement', () => {
  it('keeps a renewing plan for a 7-day grace period, then falls back to free', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });
      expect(await subscription(a.familyId)).toMatchObject({ effective: 'family', phase: 'active' });

      await shiftPeriodEnd(a.familyId, `now() - interval '3 days'`);
      expect(await subscription(a.familyId)).toMatchObject({ effective: 'family', phase: 'past_due' });

      await shiftPeriodEnd(a.familyId, `now() - interval '8 days'`);
      expect(await subscription(a.familyId)).toMatchObject({ effective: 'free', phase: 'free' });
    });
  });

  it('gives a canceled plan no grace period', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });
      await asAdmin(db);
      await db.query(`update public.subscriptions set status = 'canceled' where family_id = $1`, [a.familyId]);
      expect(await subscription(a.familyId)).toMatchObject({ effective: 'family', phase: 'canceled' });
      await shiftPeriodEnd(a.familyId, `now() - interval '1 day'`);
      expect(await subscription(a.familyId)).toMatchObject({ effective: 'free', phase: 'free' });
    });
  });

  it('pauses profiles beyond the free limit when the plan lapses, and keeps their data', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const second = (await db.query(
        `select public.add_child('Ari', 'dragon-violet', '10-12', 'en', '5678') as id`)).rows[0].id as string;
      await db.query(`select public.record_lesson_result($1, 'ai-01', 3)`, [second]);
      // One transaction means one now(); in the app, profiles are created in separate requests.
      await asAdmin(db);
      await db.query(`update public.children set created_at = now() + interval '1 second' where id = $1`, [second]);

      await shiftPeriodEnd(a.familyId, `now() - interval '8 days'`);

      await asUser(db, a.ownerId);
      const status = (await db.query(`select public.billing_status() as s`)).rows[0].s;
      expect(status).toMatchObject({ plan: 'free', phase: 'free', renews: false, paused_children: [second] });

      // The first profile carries on; the second is paused but nothing is deleted.
      await db.query(`select public.record_lesson_start($1, 'ai-02')`, [a.childId]);
      expect(await expectFailure(db, `select public.record_lesson_start($1, 'ai-02')`, [second])).toBe('child_paused');
      await asServiceRole(db);
      const gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, second]);
      expect(gate.rows[0].g).toMatchObject({ allowed: false, reason: 'child_paused' });
      await asAdmin(db);
      const kept = await db.query(`select count(*)::int as n from public.progress where child_id = $1`, [second]);
      expect(kept.rows[0].n).toBe(1);

      // Deleting the first profile frees the slot.
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      await db.query(`select public.delete_child($1)`, [a.childId]);
      await db.query(`select public.record_lesson_start($1, 'ai-02')`, [second]);
    });
  });
});

describe('checkout', () => {
  it('is closed while the Family plan has no price (the free launch)', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('billing_unavailable');
      const status = (await db.query(`select public.billing_status() as s`)).rows[0].s;
      expect(status).toMatchObject({ plan: 'free', phase: 'free', price_agorot: 0 });
    });
  });

  it('needs a guardian with a fresh TOTP step-up and sets the amount itself', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const stranger = await createUser(db);
      await putOnSale();

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('step_up_required');
      await asUser(db, stranger, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('not_a_guardian');

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const { rows } = await db.query(`select public.prepare_checkout() as c`);
      expect(rows[0].c).toMatchObject({ amount_agorot: PRICE, locale: 'he' });

      // Clients can neither read checkouts and payments nor call the service functions.
      expect(await expectFailure(db, `select * from public.checkout_sessions`)).toMatch(/permission denied/);
      expect(await expectFailure(db, `select * from public.payments`)).toMatch(/permission denied/);
      expect(await expectFailure(db, `select gateway_ref from public.subscriptions`)).toMatch(/permission denied/);
      expect(await expectFailure(db, `select public.svc_record_payment('{}'::jsonb)`)).toMatch(/permission denied/);
    });
  });

  it('refuses a second subscription while one is renewing, and rate-limits', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const checkout = await startCheckout(a.ownerId);
      await recordPayment({ transaction_id: 't1', checkout_id: checkout, recurring_id: 'dd-1' });

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('already_subscribed');

      const b = await createFamily(db);
      for (let i = 0; i < 5; i += 1) await startCheckout(b.ownerId);
      await asUser(db, b.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('rate_limited');
    });
  });
});

describe('payments', () => {
  it('applies the first payment once, for a month, and ignores replays', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const checkout = await startCheckout(a.ownerId);

      const first = await recordPayment({ transaction_id: 't1', checkout_id: checkout, recurring_id: 'dd-1', asmachta: '0289199' });
      expect(first).toMatchObject({ outcome: 'applied', kind: 'initial', family_id: a.familyId, cancel_ref: null });

      const sub = await subscription(a.familyId);
      expect(sub).toMatchObject({
        plan: 'family', status: 'active', gateway_recurring_id: 'dd-1',
        recurring_amount_agorot: PRICE, effective: 'family', phase: 'active',
      });
      const days = (new Date(sub.current_period_end).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(27);
      expect(days).toBeLessThan(32);

      const replay = await recordPayment({ transaction_id: 't1', checkout_id: checkout, recurring_id: 'dd-1' });
      expect(replay.outcome).toBe('replay');
      await asAdmin(db);
      const count = await db.query(`select count(*)::int as n from public.payments where family_id = $1`, [a.familyId]);
      expect(count.rows[0].n).toBe(1);
    });
  });

  it('does not grant the plan when the verified amount differs, but still queues the invoice', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const checkout = await startCheckout(a.ownerId);
      const result = await recordPayment({ transaction_id: 't1', checkout_id: checkout, recurring_id: 'dd-1', amount_agorot: 100 });
      expect(result.outcome).toBe('amount_mismatch');
      expect(await subscription(a.familyId)).toMatchObject({ plan: 'free', effective: 'free' });

      await asAdmin(db);
      const p = await db.query(`select invoice_status from public.payments where transaction_id = 't1'`);
      expect(p.rows[0].invoice_status).toBe('pending');
    });
  });

  it('rejects a payment it cannot place, and malformed input', async () => {
    await inTransaction(db, async () => {
      await asServiceRole(db);
      const unknown = JSON.stringify({ gateway: 'grow', transaction_id: 'x', amount_agorot: PRICE, recurring_id: 'nope' });
      expect(await expectFailure(db, `select public.svc_record_payment($1::jsonb)`, [unknown])).toBe('unknown_payment');
      const bad = JSON.stringify({ gateway: 'paypal', transaction_id: 'x', amount_agorot: PRICE });
      expect(await expectFailure(db, `select public.svc_record_payment($1::jsonb)`, [bad])).toBe('invalid_argument');
    });
  });

  it('extends renewals from the period end, or from today when late', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const checkout = await startCheckout(a.ownerId);
      await recordPayment({ transaction_id: 't1', checkout_id: checkout, recurring_id: 'dd-1' });

      // On time: a day before the period ends, the next month follows on.
      await shiftPeriodEnd(a.familyId, `date_trunc('second', now()) + interval '1 day'`);
      const before = (await subscription(a.familyId)).current_period_end;
      const renewal = await recordPayment({ transaction_id: 't2', recurring_id: 'dd-1', checkout_id: checkout });
      expect(renewal).toMatchObject({ outcome: 'applied', kind: 'renewal' });
      const after = (await subscription(a.familyId)).current_period_end;
      await asAdmin(db);
      const diff = await db.query(`select ($1::timestamptz + interval '1 month') = $2::timestamptz as same`, [before, after]);
      expect(diff.rows[0].same).toBe(true);

      // Late, past the grace period: back to Family, a full month from today.
      await shiftPeriodEnd(a.familyId, `now() - interval '10 days'`);
      expect((await subscription(a.familyId)).effective).toBe('free');
      await recordPayment({ transaction_id: 't3', recurring_id: 'dd-1' });
      const late = await subscription(a.familyId);
      expect(late.effective).toBe('family');
      expect((new Date(late.current_period_end).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(27);

      // A renewal for a different amount than the standing order is not applied.
      const odd = await recordPayment({ transaction_id: 't4', recurring_id: 'dd-1', amount_agorot: 1990 });
      expect(odd.outcome).toBe('amount_mismatch');
    });
  });

  it('keeps the first of two paid checkouts and asks for the second to be stopped', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const one = await startCheckout(a.ownerId);
      const two = await startCheckout(a.ownerId);
      await recordPayment({ transaction_id: 't1', checkout_id: one, recurring_id: 'dd-1' });
      const second = await recordPayment({
        transaction_id: 't2', checkout_id: two, recurring_id: 'dd-2', ref: { transaction_token: 'second' },
      });
      expect(second).toMatchObject({ outcome: 'duplicate', cancel_ref: { transaction_token: 'second' } });
      expect((await subscription(a.familyId)).gateway_recurring_id).toBe('dd-1');
    });
  });

  it('keeps paid-up time when a canceled family subscribes again', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await recordPayment({ transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1' });
      await asServiceRole(db);
      await db.query(`select public.svc_mark_canceled($1, $2)`, [a.familyId, a.ownerId]);
      await shiftPeriodEnd(a.familyId, `now() + interval '10 days'`);

      const again = await recordPayment({ transaction_id: 't2', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-2' });
      // The old standing order was already stopped at cancellation, so nothing to stop now.
      expect(again).toMatchObject({ outcome: 'applied', cancel_ref: null });
      const sub = await subscription(a.familyId);
      expect(sub).toMatchObject({ status: 'active', gateway_recurring_id: 'dd-2' });
      expect((new Date(sub.current_period_end).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(37);
    });
  });

  it('replaces a lapsed standing order that was never canceled, and asks for it to be stopped', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await recordPayment({
        transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1', ref: { transaction_token: 'old' },
      });
      await shiftPeriodEnd(a.familyId, `now() - interval '20 days'`);
      const fresh = await recordPayment({ transaction_id: 't2', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-2' });
      expect(fresh).toMatchObject({ outcome: 'applied', cancel_ref: { transaction_token: 'old' } });
    });
  });
});

describe('invoices', () => {
  it('leases each payment to one worker, records the document once, and backs off on failure', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await recordPayment({ transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1' });

      await asServiceRole(db);
      const claimed = (await db.query(`select public.svc_claim_invoices('grow', 't1') as c`)).rows[0].c;
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ transaction_id: 't1', amount_agorot: PRICE, attempt: 1, locale: 'he' });
      expect(claimed[0].email).toMatch(/@example\.test$/);

      // Leased: a second worker gets nothing.
      expect((await db.query(`select public.svc_claim_invoices() as c`)).rows[0].c).toEqual([]);

      await db.query(`select public.svc_invoice_failed('grow', 't1', 'icount timeout')`);
      await asAdmin(db);
      const failed = await db.query(
        `select invoice_status, invoice_error, invoice_next_try > now() as later from public.payments where transaction_id = 't1'`);
      expect(failed.rows[0]).toEqual({ invoice_status: 'pending', invoice_error: 'icount timeout', later: true });

      await db.query(`update public.payments set invoice_next_try = now() where transaction_id = 't1'`);
      await asServiceRole(db);
      expect((await db.query(`select public.svc_claim_invoices() as c`)).rows[0].c[0].attempt).toBe(2);
      await db.query(
        `select public.svc_record_invoice('grow', 't1', 'icount', '1001', 'https://example.test/doc/1001')`);
      await db.query(
        `select public.svc_record_invoice('grow', 't1', 'icount', '1001', 'https://example.test/doc/1001')`);

      await asUser(db, a.ownerId);
      const mine = await db.query(`select document_id, amount_agorot from public.invoices`);
      expect(mine.rows).toEqual([{ document_id: '1001', amount_agorot: PRICE }]);
    });
  });

  it('gives up after ten attempts and leaves the payment for a person', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await recordPayment({ transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1' });
      await asAdmin(db);
      await db.query(`update public.payments set invoice_attempts = 10 where transaction_id = 't1'`);
      await asServiceRole(db);
      await db.query(`select public.svc_invoice_failed('grow', 't1', 'rejected')`);
      await asAdmin(db);
      const p = await db.query(`select invoice_status from public.payments where transaction_id = 't1'`);
      expect(p.rows[0].invoice_status).toBe('failed');
    });
  });
});

describe('cancellation', () => {
  it('needs a step-up, keeps the plan until the period ends, and audits', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_cancel_subscription()`)).toBe('not_subscribed');

      await recordPayment({ transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1' });
      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.prepare_cancel_subscription()`)).toBe('step_up_required');
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const prepared = (await db.query(`select public.prepare_cancel_subscription() as p`)).rows[0].p;
      expect(prepared).toEqual({ family_id: a.familyId });

      await asServiceRole(db);
      const details = (await db.query(`select public.svc_cancel_details($1) as d`, [a.familyId])).rows[0].d;
      expect(details).toEqual({ gateway: 'grow', recurring_id: 'dd-1', ref: { transaction_token: 'tok' } });
      const done = (await db.query(`select public.svc_mark_canceled($1, $2) as d`, [a.familyId, a.ownerId])).rows[0].d;
      expect(done.access_until).toBeTruthy();

      expect(await subscription(a.familyId)).toMatchObject({ status: 'canceled', effective: 'family', phase: 'canceled' });
      await asUser(db, a.ownerId);
      const status = (await db.query(`select public.billing_status() as s`)).rows[0].s;
      expect(status).toMatchObject({ plan: 'family', phase: 'canceled', renews: false });

      // Family deletion no longer waits on a canceled standing order.
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      await db.query(`select public.prepare_family_deletion()`);

      // A charge that still arrives after cancellation is recorded and flagged for a refund.
      const late = await recordPayment({ transaction_id: 't2', recurring_id: 'dd-1' });
      expect(late.outcome).toBe('charged_after_cancel');
      await asAdmin(db);
      const audit = await db.query(
        `select action from public.audit_log where family_id = $1 and action like 'billing.%' order by id`, [a.familyId]);
      expect(audit.rows.map((r) => r.action)).toEqual([
        'billing.checkout_started', 'billing.payment_applied', 'billing.canceled', 'billing.payment_charged_after_cancel',
      ]);
    });
  });

  it('leaves gateway identifiers out of the family export', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await recordPayment({ transaction_id: 't1', checkout_id: await startCheckout(a.ownerId), recurring_id: 'dd-1' });
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const exported = (await db.query(`select public.export_family_data() as e`)).rows[0].e;
      expect(exported.subscription).not.toHaveProperty('gateway_ref');
      expect(exported.subscription).not.toHaveProperty('gateway_recurring_id');
      expect(exported.payments).toEqual([expect.objectContaining({ kind: 'initial', outcome: 'applied', amount_agorot: PRICE })]);
    });
  });
});

describe('free mode', () => {
  async function setSettings(sql: string) {
    await asAdmin(db);
    await db.query(`update public.app_settings set ${sql}`);
  }

  it('gives every family the Family plan and asks nobody to pay', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await setSettings('free_family_plan = true');

      expect(await subscription(a.familyId)).toMatchObject({ plan: 'free', effective: 'family', phase: 'free' });

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_checkout()`)).toBe('billing_unavailable');
      const status = (await db.query(`select public.billing_status() as s`)).rows[0].s;
      expect(status).toMatchObject({ plan: 'family', phase: 'free', renews: false, free_family_plan: true });

      // Family limits apply: a second profile, and the AI-security track for 10-12.
      const older = (await db.query(
        `select public.add_child('Ari', 'dragon-violet', '10-12', 'en', '5678') as id`)).rows[0].id as string;
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_start($1, 'aisec-01')`, [older]);

      // Switching it off later pauses, never deletes, the extra profile.
      await setSettings('free_family_plan = false');
      await asAdmin(db);
      await db.query(`update public.children set created_at = now() + interval '1 second' where id = $1`, [older]);
      await asUser(db, a.ownerId);
      expect((await db.query(`select public.billing_status() as s`)).rows[0].s.paused_children).toEqual([older]);
    });
  });

  it('switches SI off for everyone, before any other check', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await setSettings('tutor_available = false');
      await asServiceRole(db);
      const gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(gate.rows[0].g).toMatchObject({ allowed: false, reason: 'tutor_unavailable' });

      await setSettings('tutor_available = true');
      await asServiceRole(db);
      const open = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(open.rows[0].g).toMatchObject({ allowed: true });
    });
  });

  it('lets parents read the switches but never change them', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      const { rows } = await db.query(`select free_family_plan, tutor_available from public.app_settings`);
      expect(rows).toEqual([{ free_family_plan: false, tutor_available: true }]);
      expect(await expectFailure(db, `update public.app_settings set free_family_plan = true`)).toMatch(/permission denied/);
    });
  });
});
