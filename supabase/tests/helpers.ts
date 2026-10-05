import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

export type Db = pg.Client;

/** One connection per test file; every test runs inside a transaction that is rolled back. */
export async function connect(): Promise<Db> {
  const client = new pg.Client({ connectionString: inject('testDatabaseUrl') });
  await client.connect();
  return client;
}

export async function inTransaction(db: Db, fn: () => Promise<void>): Promise<void> {
  await db.query('begin');
  try {
    await fn();
  } finally {
    await db.query('rollback');
  }
}

/** Back to the superuser that owns the test database. */
export async function asAdmin(db: Db): Promise<void> {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}

export async function asServiceRole(db: Db): Promise<void> {
  await db.query('reset role');
  await db.query('set local role service_role');
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
}

export async function asAnon(db: Db): Promise<void> {
  await db.query('reset role');
  await db.query('set local role anon');
  await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
}

export interface UserOptions {
  /** Seconds since a TOTP verification; omit for a password/OAuth-only (AAL1) session. */
  totpSecondsAgo?: number;
}

/** Act as a signed-in user, with the JWT claims Supabase Auth would issue. */
export async function asUser(db: Db, userId: string, options: UserOptions = {}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const amr: Array<{ method: string; timestamp: number }> = [{ method: 'oauth', timestamp: now - 3600 }];
  let aal = 'aal1';
  if (options.totpSecondsAgo !== undefined) {
    amr.unshift({ method: 'totp', timestamp: now - options.totpSecondsAgo });
    aal = 'aal2';
  }
  const claims = { sub: userId, role: 'authenticated', aal, amr };
  await db.query('reset role');
  await db.query('set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
}

export async function createUser(db: Db): Promise<string> {
  const id = randomUUID();
  await asAdmin(db);
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@example.test`]);
  return id;
}

export interface FamilyFixture {
  ownerId: string;
  familyId: string;
  childId: string;
}

/**
 * A family with an owner, core + tutor consent and one child whose PIN is 1234.
 * Built through the real RPCs, the same way the app does it.
 */
export async function createFamily(db: Db, options: { plan?: 'free' | 'family' } = {}): Promise<FamilyFixture> {
  const ownerId = await createUser(db);

  await asServiceRole(db);
  const family = await db.query<{ id: string }>(`select public.svc_create_family($1, 'he') as id`, [ownerId]);
  const familyId = family.rows[0]!.id;

  if (options.plan === 'family') {
    await db.query(
      `update public.subscriptions set plan = 'family', status = 'active',
              current_period_end = now() + interval '30 days'
        where family_id = $1`,
      [familyId],
    );
  }

  await asUser(db, ownerId, { totpSecondsAgo: 30 });
  await db.query(`select public.grant_consent('core', '2026-10-01')`);
  await db.query(`select public.grant_consent('tutor', '2026-10-01')`);
  const child = await db.query<{ id: string }>(
    `select public.add_child('Noa', 'dragon-teal', '8-9', 'he', '1234') as id`,
  );

  await asAdmin(db);
  return { ownerId, familyId, childId: child.rows[0]!.id };
}

/**
 * Runs a statement that must fail, inside a savepoint so the surrounding transaction
 * survives. Resolves with the Postgres error message.
 */
export async function expectFailure(db: Db, sql: string, params: unknown[] = []): Promise<string> {
  await db.query('savepoint expect_failure');
  try {
    await db.query(sql, params);
  } catch (error) {
    await db.query('rollback to savepoint expect_failure');
    return (error as Error).message;
  }
  await db.query('release savepoint expect_failure');
  throw new Error(`Expected failure but statement succeeded: ${sql}`);
}
