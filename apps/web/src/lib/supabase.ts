import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see apps/web/.env.example).');
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
export const POLICY_VERSION = import.meta.env.VITE_POLICY_VERSION ?? '2026-10-01';
export const CREATE_FAMILY_URL = import.meta.env.VITE_CREATE_FAMILY_URL ?? '/api/create-family';

export const supabase = createClient(url, anonKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Error codes the database raises; see supabase/migrations/*_client_rpcs.sql. */
export type RpcErrorCode =
  | 'not_a_guardian'
  | 'not_found'
  | 'step_up_required'
  | 'consent_required'
  | 'plan_child_limit'
  | 'child_inactive'
  | 'lesson_not_available'
  | 'invalid_argument'
  | 'owner_only'
  | 'cancel_subscription_first'
  | 'time_up'
  | 'child_paused'
  | 'unknown';

const KNOWN: RpcErrorCode[] = [
  'not_a_guardian', 'not_found', 'step_up_required', 'consent_required', 'plan_child_limit',
  'child_inactive', 'lesson_not_available', 'invalid_argument', 'owner_only',
  'cancel_subscription_first', 'time_up', 'child_paused',
];

export class RpcError extends Error {
  constructor(readonly code: RpcErrorCode, message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const code = KNOWN.find((k) => k === error.message) ?? 'unknown';
    throw new RpcError(code, error.message);
  }
  return data as T;
}

/** An Edge Function said no; `code` is its `error` field. */
export class FunctionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'FunctionError';
  }
}

/** POSTs to an Edge Function as the signed-in parent. */
export async function callFunction<T>(name: string, body: unknown = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new FunctionError(json.error ?? 'unknown', response.status);
  return json as T;
}

export function formatShekels(agorot: number, lang: 'he' | 'en'): string {
  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' })
    .format(agorot / 100);
}

export function formatDate(iso: string, lang: 'he' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-IL', {
    dateStyle: 'long', timeZone: 'Asia/Jerusalem',
  });
}
