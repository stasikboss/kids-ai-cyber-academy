import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asAdmin, asAnon, asServiceRole, asUser, connect, createFamily, createUser,
  type Db, expectFailure, inTransaction,
} from './helpers.ts';

let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

describe('schema guarantees', () => {
  it('has RLS enabled on every table in public', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('gives authenticated no INSERT, UPDATE or DELETE on any public table', async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('authenticated', 'anon')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
    expect(rows).toEqual([]);
  });

  it('lets anon execute no function in public', async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(rows).toEqual([]);
  });

  it('keeps every SECURITY DEFINER function on a fixed search_path', async () => {
    const { rows } = await db.query<{ name: string }>(`
      select n.nspname || '.' || p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app') and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
        )`);
    expect(rows).toEqual([]);
  });

  it('pins families to Israel', async () => {
    await inTransaction(db, async () => {
      await asAdmin(db);
      const message = await expectFailure(db, `insert into public.families (country) values ('US')`);
      expect(message).toMatch(/families_country_check/);
    });
  });
});

describe('cross-family isolation', () => {
  it('shows a guardian only their own family across every child-data table', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);

      // Give family B some data in every table.
      await asUser(db, b.ownerId);
      await db.query(`select public.record_lesson_result($1, 'ai-01', 3)`, [b.childId]);
      await asServiceRole(db);
      await db.query(
        `select public.svc_log_tutor_turn($1, 'hi', '{}', 'Hello!', '{}', 10, 5)`, [b.childId]);
      await db.query(
        `select public.svc_log_safety_event($1, 'pii_blocked', 'warn', '{"kinds":["phone"]}')`, [b.childId]);

      await asUser(db, a.ownerId);
      for (const table of [
        'families', 'guardians', 'children', 'consents', 'progress', 'badges',
        'tutor_messages', 'safety_events', 'audit_log', 'subscriptions', 'invoices',
      ]) {
        const column = table === 'families' ? 'id' : 'family_id';
        const { rows } = await db.query(
          `select count(*)::int as n from public.${table} where ${column} = $1`, [b.familyId]);
        expect(rows[0].n, `${table} leaked family B rows`).toBe(0);
      }

      const own = await db.query(`select id from public.children`);
      expect(own.rows.map((r) => r.id)).toEqual([a.childId]);
    });
  });

  it('refuses writes against another family\'s child', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      const b = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 10 });

      for (const sql of [
        `select public.record_lesson_start($1, 'ai-01')`,
        `select public.record_lesson_result($1, 'ai-01', 2)`,
        `select public.verify_child_pin($1, '1234')`,
        `select public.tutor_quota($1)`,
        `select public.set_child_pin($1, '5678')`,
        `select public.update_child_settings($1, 20, false, 'en')`,
      ]) {
        const message = await expectFailure(db, sql, [b.childId]);
        expect(message, sql).toBe('not_found');
      }
    });
  });

  it('rejects direct table writes from clients', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 10 });
      const message = await expectFailure(
        db,
        `insert into public.progress (child_id, lesson_id, family_id, status) values ($1, 'ai-01', $2, 'completed')`,
        [a.childId, a.familyId],
      );
      expect(message).toMatch(/permission denied/);
    });
  });

  it('never exposes the PIN hash to clients', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      const message = await expectFailure(db, `select pin_hash from public.children`);
      expect(message).toMatch(/permission denied/);
    });
  });

  it('gives anon nothing', async () => {
    await inTransaction(db, async () => {
      await createFamily(db);
      await asAnon(db);
      expect(await expectFailure(db, `select * from public.lessons`)).toMatch(/permission denied/);
      expect(await expectFailure(db, `select id from public.children`)).toMatch(/permission denied/);
    });
  });

  it('keeps svc_* functions away from signed-in users', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId, { totpSecondsAgo: 10 });
      const message = await expectFailure(db, `select public.svc_create_family($1, 'he')`, [a.ownerId]);
      expect(message).toMatch(/permission denied/);
    });
  });
});

describe('step-up and consent', () => {
  it('requires a TOTP step-up within 10 minutes to add a child', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });

      await asUser(db, a.ownerId);
      expect(await expectFailure(db, `select public.add_child('Ari', 'dragon-violet', '10-12', 'en', '2468')`))
        .toBe('step_up_required');

      await asUser(db, a.ownerId, { totpSecondsAgo: 11 * 60 });
      expect(await expectFailure(db, `select public.add_child('Ari', 'dragon-violet', '10-12', 'en', '2468')`))
        .toBe('step_up_required');

      await asUser(db, a.ownerId, { totpSecondsAgo: 60 });
      const { rows } = await db.query(`select public.add_child('Ari', 'dragon-violet', '10-12', 'en', '2468') as id`);
      expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('requires core consent before any child profile exists', async () => {
    await inTransaction(db, async () => {
      const userId = await createUser(db);
      await asServiceRole(db);
      await db.query(`select public.svc_create_family($1, 'en')`, [userId]);
      await asUser(db, userId, { totpSecondsAgo: 5 });
      expect(await expectFailure(db, `select public.add_child('Ari', 'dragon-violet', '8-9', 'en', '2468')`))
        .toBe('consent_required');
    });
  });

  it('keeps family creation idempotent', async () => {
    await inTransaction(db, async () => {
      const userId = await createUser(db);
      await asServiceRole(db);
      const first = await db.query(`select public.svc_create_family($1, 'he') as id`, [userId]);
      const second = await db.query(`select public.svc_create_family($1, 'en') as id`, [userId]);
      expect(second.rows[0].id).toBe(first.rows[0].id);
    });
  });
});

describe('plans', () => {
  it('limits the free plan to one child and the family plan to four', async () => {
    await inTransaction(db, async () => {
      const free = await createFamily(db);
      await asUser(db, free.ownerId, { totpSecondsAgo: 5 });
      expect(await expectFailure(db, `select public.add_child('Second', 'dragon-violet', '8-9', 'he', '1111')`))
        .toBe('plan_child_limit');

      const paid = await createFamily(db, { plan: 'family' });
      await asUser(db, paid.ownerId, { totpSecondsAgo: 5 });
      for (const name of ['Two', 'Three', 'Four']) {
        await db.query(`select public.add_child($1, 'dragon-violet', '8-9', 'he', '1111')`, [name]);
      }
      expect(await expectFailure(db, `select public.add_child('Five', 'dragon-violet', '8-9', 'he', '1111')`))
        .toBe('plan_child_limit');
    });
  });

  it('keeps family-plan lessons and older-age lessons locked', async () => {
    await inTransaction(db, async () => {
      const free = await createFamily(db);
      await asUser(db, free.ownerId);
      expect(await expectFailure(db, `select public.record_lesson_start($1, 'aisec-01')`, [free.childId]))
        .toBe('lesson_not_available');

      // Paid plan, but the fixture child is 8-9 and the AI-security track starts at 10.
      const paid = await createFamily(db, { plan: 'family' });
      await asUser(db, paid.ownerId);
      expect(await expectFailure(db, `select public.record_lesson_start($1, 'aisec-01')`, [paid.childId]))
        .toBe('lesson_not_available');
    });
  });

  it('treats a canceled subscription as paid until its period ends', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db, { plan: 'family' });
      await asAdmin(db);
      await db.query(`update public.subscriptions set status = 'canceled' where family_id = $1`, [a.familyId]);
      let plan = await db.query(`select app.family_plan($1) as plan`, [a.familyId]);
      expect(plan.rows[0].plan).toBe('family');

      await db.query(
        `update public.subscriptions set current_period_end = now() - interval '1 minute' where family_id = $1`,
        [a.familyId]);
      plan = await db.query(`select app.family_plan($1) as plan`, [a.familyId]);
      expect(plan.rows[0].plan).toBe('free');
    });
  });
});

describe('child PIN', () => {
  it('locks the profile for 15 minutes after five wrong tries', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);

      for (let attempt = 1; attempt <= 4; attempt++) {
        const { rows } = await db.query(`select public.verify_child_pin($1, '0000') as r`, [a.childId]);
        expect(rows[0].r).toMatchObject({ ok: false, attempts_left: 5 - attempt });
      }
      const fifth = await db.query(`select public.verify_child_pin($1, '0000') as r`, [a.childId]);
      expect(fifth.rows[0].r.ok).toBe(false);
      expect(fifth.rows[0].r.locked_until).not.toBeNull();

      // Even the right PIN is refused while locked.
      const right = await db.query(`select public.verify_child_pin($1, '1234') as r`, [a.childId]);
      expect(right.rows[0].r.ok).toBe(false);
    });
  });

  it('accepts the right PIN and resets the counter', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.verify_child_pin($1, '0000')`, [a.childId]);
      const { rows } = await db.query(`select public.verify_child_pin($1, '1234') as r`, [a.childId]);
      expect(rows[0].r).toEqual({ ok: true });
    });
  });
});

describe('progress', () => {
  it('keeps the best score and validates the range', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      await db.query(`select public.record_lesson_result($1, 'cyber-02', 3)`, [a.childId]);
      const lower = await db.query(`select public.record_lesson_result($1, 'cyber-02', 1) as r`, [a.childId]);
      expect(lower.rows[0].r.best_score).toBe(3);
      expect(await expectFailure(db, `select public.record_lesson_result($1, 'cyber-02', 4)`, [a.childId]))
        .toBe('invalid_argument');
    });
  });

  it('awards a track badge once every lesson in the track is complete', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asUser(db, a.ownerId);
      let last: { new_badges: string[] } = { new_badges: [] };
      for (let i = 1; i <= 6; i++) {
        const { rows } = await db.query(
          `select public.record_lesson_result($1, $2, 2) as r`, [a.childId, `cyber-0${i}`]);
        last = rows[0].r;
        if (i < 6) expect(last.new_badges).toEqual([]);
      }
      expect(last.new_badges).toEqual(['track-cyber-safety']);
      const again = await db.query(`select public.record_lesson_result($1, 'cyber-06', 3) as r`, [a.childId]);
      expect(again.rows[0].r.new_badges).toEqual([]);
    });
  });
});

describe('tutor gate and retention', () => {
  it('enforces consent, the on/off switch and the daily quota', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asServiceRole(db);

      let gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(gate.rows[0].g).toMatchObject({ allowed: true, used: 0, limit: 5, plan: 'free', language: 'he' });

      for (let i = 0; i < 5; i++) {
        await db.query(`select public.svc_log_tutor_turn($1, 'q', '{}', 'a', '{}', 1, 1)`, [a.childId]);
      }
      gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(gate.rows[0].g).toMatchObject({ allowed: false, reason: 'quota_reached', used: 5 });

      const stranger = await createUser(db);
      await asServiceRole(db);
      gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [stranger, a.childId]);
      expect(gate.rows[0].g).toEqual({ allowed: false, reason: 'not_found' });

      await asUser(db, a.ownerId);
      await db.query(`select public.revoke_consent('tutor')`);
      await asServiceRole(db);
      await db.query(`delete from public.tutor_messages where child_id = $1`, [a.childId]);
      gate = await db.query(`select public.svc_tutor_gate($1, $2) as g`, [a.ownerId, a.childId]);
      expect(gate.rows[0].g).toMatchObject({ allowed: false, reason: 'consent_required' });
    });
  });

  it('deletes transcripts after 30 days and keeps newer ones', async () => {
    await inTransaction(db, async () => {
      const a = await createFamily(db);
      await asAdmin(db);
      await db.query(
        `insert into public.tutor_messages (child_id, family_id, role, text_redacted, created_at) values
           ($1, $2, 'child', 'old', now() - interval '31 days'),
           ($1, $2, 'child', 'recent', now() - interval '29 days')`,
        [a.childId, a.familyId]);

      const purge = await db.query(`select app.purge_expired() as r`);
      expect(purge.rows[0].r.tutor_messages).toBe(1);

      const left = await db.query(`select text_redacted from public.tutor_messages where child_id = $1`, [a.childId]);
      expect(left.rows.map((r) => r.text_redacted)).toEqual(['recent']);
    });
  });
});
