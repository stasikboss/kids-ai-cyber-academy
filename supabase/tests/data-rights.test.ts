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

describe('daily time limit', () => {
  it('adds up visible time and never double-counts quick beats', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);

      const status = await db.query(`select public.record_activity($1, 1) as s`, [a.childId]);
      expect(status.rows[0].s).toEqual({ used_seconds: 0, limit_seconds: 1800, time_up: false });

      // now() is fixed inside one transaction, so each beat after the first sees 0 s
      // elapsed and is credited only the 5 s of slack, not the 60 s it claims.
      const first = await db.query(`select public.record_activity($1, 60) as s`, [a.childId]);
      expect(first.rows[0].s.used_seconds).toBe(5);
      const second = await db.query(`select public.record_activity($1, 60) as s`, [a.childId]);
      expect(second.rows[0].s.used_seconds).toBe(10);

      expect(await expectFailure(db, `select public.record_activity($1, 500)`, [a.childId])).toBe('invalid_argument');
    });
  });

  it('stops the tutor and new lessons once time is up, but lets a started lesson finish', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_start($1, 'ai-01')`, [a.childId]);
      await db.query(`select public.record_activity($1, 1)`, [a.childId]);

      await asAdmin(db);
      await db.query(`update public.child_activity set seconds = 1800 where child_id = $1`, [a.childId]);

      await asServiceRole(db);
      const gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(gate.rows[0].g).toMatchObject({ allowed: false, reason: 'time_up' });

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.record_lesson_start($1, 'cyber-02')`, [a.childId])).toBe('time_up');
      const finish = await db.query(`select public.record_lesson_result($1, 'ai-01', 2) as r`, [a.childId]);
      expect(finish.rows[0].r.best_score).toBe(2);
    });
  });

  it('keeps activity inside the family', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);
      await asUser(db, b.ownerId);
      await db.query(`select public.record_activity($1, 60)`, [b.childId]);

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.record_activity($1, 60)`, [b.childId])).toBe('not_found');
      const rows = await db.query(`select count(*)::int as n from public.child_activity where family_id = $1`, [b.familyId]);
      expect(rows.rows[0].n).toBe(0);
    });
  });
});

describe('export', () => {
  it('returns the family\'s own data without PIN hashes, and needs a step-up', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_result($1, 'ai-01', 3)`, [a.childId]);

      expect(await expectFailure(db, `select public.export_family_data()`)).toBe('step_up_required');

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const { rows } = await db.query(`select public.export_family_data() as e`);
      const exported = rows[0].e;

      expect(exported.format).toBe('kids-ai-cyber-academy/export-v1');
      expect(exported.family.id).toBe(a.familyId);
      expect(exported.children).toHaveLength(1);
      expect(exported.children[0]).not.toHaveProperty('pin_hash');
      expect(exported.children[0]).not.toHaveProperty('pin_failed_attempts');
      expect(exported.progress).toHaveLength(1);
      expect(exported.guardians[0].email).toBe(`${a.ownerId}@example.test`);
      expect(JSON.stringify(exported)).not.toContain(b.familyId);
      expect(JSON.stringify(exported)).not.toContain(b.childId);
    });
  });
});

describe('deleting a child', () => {
  it('removes the child and everything about them, and needs a step-up', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_result($1, 'ai-01', 3)`, [a.childId]);
      await asServiceRole(db);
      await db.query(`select public.svc_log_tutor_turn($1, 'q', '{}', 'a', '{}', 1, 1)`, [a.childId]);

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.delete_child($1)`, [a.childId])).toBe('step_up_required');

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      await db.query(`select public.delete_child($1)`, [a.childId]);

      await asAdmin(db);
      for (const table of ['children', 'progress', 'tutor_messages']) {
        const column = table === 'children' ? 'id' : 'child_id';
        const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [a.childId]);
        expect(rows[0].n, table).toBe(0);
      }
    });
  });

  it('cannot delete another family\'s child', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.delete_child($1)`, [b.childId])).toBe('not_found');
    });
  });
});

describe('deleting a family', () => {
  it('lets only the owner prepare it, with a step-up', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const coParent = await createUser(db);
      await db.query(`insert into public.guardians (user_id, family_id, role) values ($1, $2, 'co_parent')`, [coParent, a.familyId]);

      await asUser(db, coParent, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_family_deletion()`)).toBe('owner_only');

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.prepare_family_deletion()`)).toBe('step_up_required');

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      const { rows } = await db.query(`select public.prepare_family_deletion() as p`);
      expect(rows[0].p.family_id).toBe(a.familyId);
      expect(rows[0].p.guardian_ids.sort()).toEqual([a.ownerId, coParent].sort());
    });
  });

  it('refuses while a paid standing order is live', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });
      await asAdmin(db);
      await db.query(
        `update public.subscriptions set gateway = 'grow', gateway_recurring_id = 'ro-1' where family_id = $1`, [a.familyId]);
      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.prepare_family_deletion()`)).toBe('cancel_subscription_first');
    });
  });

  it('deletes the whole family, keeps other families, and leaves one pseudonymous record', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_result($1, 'ai-01', 3)`, [a.childId]);

      await asUser(db, a.ownerId, { totpSecondsAgo: 20 });
      expect(await expectFailure(db, `select public.svc_delete_family($1, $2)`, [a.familyId, a.ownerId]))
        .toMatch(/permission denied/);

      await asServiceRole(db);
      expect(await expectFailure(db, `select public.svc_delete_family($1, $2)`, [a.familyId, b.ownerId]))
        .toBe('owner_only');
      const { rows } = await db.query(`select public.svc_delete_family($1, $2) as r`, [a.familyId, a.ownerId]);
      expect(rows[0].r.guardian_ids).toEqual([a.ownerId]);

      await asAdmin(db);
      for (const table of ['families', 'guardians', 'children', 'consents', 'progress', 'subscriptions']) {
        const column = table === 'families' ? 'id' : 'family_id';
        const left = await db.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [a.familyId]);
        expect(left.rows[0].n, table).toBe(0);
      }
      const audit = await db.query(`select family_id, action from public.audit_log where target = $1`, [a.familyId]);
      expect(audit.rows).toEqual([{ family_id: null, action: 'family.deleted' }]);

      const other = await db.query(`select count(*)::int as n from public.children where family_id = $1`, [b.familyId]);
      expect(other.rows[0].n).toBe(1);
    });
  });
});
