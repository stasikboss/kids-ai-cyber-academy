import { describe, expect, it } from 'vitest';
import { deleteFamily, type DeleteFamilyDeps } from '../supabase/functions/_shared/delete-family.ts';

function deps(overrides: Partial<DeleteFamilyDeps> = {}) {
  const calls: string[] = [];
  const base: DeleteFamilyDeps = {
    prepare: async () => {
      calls.push('prepare');
      return { family_id: 'fam', guardian_ids: ['owner', 'co'] };
    },
    deleteFamily: async (familyId, actorId) => {
      calls.push(`deleteFamily:${familyId}:${actorId}`);
      return { guardian_ids: ['owner', 'co'] };
    },
    deleteAuthUser: async (id) => {
      calls.push(`auth:${id}`);
    },
  };
  return { deps: { ...base, ...overrides }, calls };
}

describe('deleteFamily', () => {
  it('prepares as the owner, deletes the data, then every guardian account', async () => {
    const { deps: d, calls } = deps();
    const result = await deleteFamily(d, 'owner');
    expect(result).toEqual({ status: 200, body: { deleted: true, accounts_removed: 2, accounts_failed: 0 } });
    expect(calls).toEqual(['prepare', 'deleteFamily:fam:owner', 'auth:owner', 'auth:co']);
  });

  it.each([
    ['step_up_required', 403],
    ['owner_only', 403],
    ['cancel_subscription_first', 409],
  ])('stops before deleting anything when prepare says %s', async (code, status) => {
    const { deps: d, calls } = deps({ prepare: async () => { throw new Error(code); } });
    const result = await deleteFamily(d, 'owner');
    expect(result).toEqual({ status, body: { error: code } });
    expect(calls).toEqual([]);
  });

  it('hides unexpected database errors from the caller', async () => {
    const { deps: d } = deps({ prepare: async () => { throw new Error('connection terminated'); } });
    expect(await deleteFamily(d, 'owner')).toEqual({ status: 500, body: { error: 'delete_failed' } });
  });

  it('reports auth accounts it could not remove after the data is gone', async () => {
    const { deps: d } = deps({
      deleteAuthUser: async (id) => { if (id === 'co') throw new Error('timeout'); },
    });
    expect(await deleteFamily(d, 'owner')).toEqual({
      status: 200,
      body: { deleted: true, accounts_removed: 1, accounts_failed: 1 },
    });
  });
});
