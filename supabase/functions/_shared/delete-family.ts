/**
 * Family deletion, end to end:
 *
 *   1. prepare   as the owner (their own token): owner check, fresh TOTP step-up,
 *                no live standing order. Returns the family and its guardians.
 *   2. delete    as the service role: the family row and everything under it.
 *   3. auth      as the service role: every guardian's auth user.
 *
 * Dependencies are injected so the flow is unit-tested without Supabase.
 */

export interface DeleteFamilyDeps {
  prepare(): Promise<{ family_id: string; guardian_ids: string[] }>;
  deleteFamily(familyId: string, actorId: string): Promise<{ guardian_ids: string[] }>;
  deleteAuthUser(userId: string): Promise<void>;
  log?(message: string): void;
}

export interface DeleteFamilyResult {
  status: number;
  body: Record<string, unknown>;
}

/** Database error messages that are the caller's to fix, with their HTTP status. */
const CALLER_ERRORS: Record<string, number> = {
  not_a_guardian: 403,
  owner_only: 403,
  step_up_required: 403,
  cancel_subscription_first: 409,
};

export async function deleteFamily(deps: DeleteFamilyDeps, actorId: string): Promise<DeleteFamilyResult> {
  let prepared: { family_id: string; guardian_ids: string[] };
  try {
    prepared = await deps.prepare();
  } catch (error) {
    const code = (error as Error).message;
    const status = CALLER_ERRORS[code];
    if (status) return { status, body: { error: code } };
    deps.log?.(`prepare_family_deletion failed: ${code}`);
    return { status: 500, body: { error: 'delete_failed' } };
  }

  let removed: { guardian_ids: string[] };
  try {
    removed = await deps.deleteFamily(prepared.family_id, actorId);
  } catch (error) {
    deps.log?.(`svc_delete_family failed: ${(error as Error).message}`);
    return { status: 500, body: { error: 'delete_failed' } };
  }

  // The family data is gone at this point. A failed auth deletion leaves only an
  // account with no family (it would see setup again), so report it and carry on.
  const failed: string[] = [];
  for (const userId of removed.guardian_ids) {
    try {
      await deps.deleteAuthUser(userId);
    } catch (error) {
      failed.push(userId);
      deps.log?.(`auth user deletion failed for ${userId}: ${(error as Error).message}`);
    }
  }

  return {
    status: 200,
    body: { deleted: true, accounts_removed: removed.guardian_ids.length - failed.length, accounts_failed: failed.length },
  };
}
