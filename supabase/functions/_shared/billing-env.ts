/**
 * Environment and Supabase wiring shared by the billing Edge Functions (Deno only).
 * Unit tests import billing.ts, grow.ts and icount.ts directly, never this file.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type ClaimedPayment, type InvoiceDeps, invoiceDescription } from './billing.ts';
import { GROW_BASE_URLS, type GrowConfig } from './grow.ts';
import { type IcountConfig, issueInvoiceReceipt } from './icount.ts';

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const SUPABASE_URL = requireEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

export const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A client that runs RPCs as the signed-in user, so step-up checks read their claims. */
export function asUser(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Runs an RPC and returns its data, throwing the database's error message on failure. */
export async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function growConfig(): GrowConfig {
  const env = Deno.env.get('GROW_ENV') === 'production' ? 'production' : 'sandbox';
  return {
    baseUrl: GROW_BASE_URLS[env],
    userId: requireEnv('GROW_USER_ID'),
    pageCode: requireEnv('GROW_PAGE_CODE'),
  };
}

/** "icount" (default) issues invoices here; "gateway" leaves them to Grow's own invoicing. */
export function invoicingMode(): 'icount' | 'gateway' {
  return Deno.env.get('INVOICING') === 'gateway' ? 'gateway' : 'icount';
}

function icountConfig(): IcountConfig {
  return {
    companyId: requireEnv('ICOUNT_COMPANY_ID'),
    user: requireEnv('ICOUNT_USER'),
    password: requireEnv('ICOUNT_PASSWORD'),
  };
}

/** Invoice-queue dependencies; pass a transaction to issue just that payment's invoice. */
export function invoiceDeps(only?: { gateway: string; transactionId: string }): InvoiceDeps {
  const icount = icountConfig();
  return {
    claim: () => rpc<ClaimedPayment[]>(service, 'svc_claim_invoices', {
      p_gateway: only?.gateway ?? null,
      p_transaction: only?.transactionId ?? null,
      p_limit: only ? 1 : 20,
    }),
    issue: (payment) => issueInvoiceReceipt(icount, {
      amountAgorot: payment.amount_agorot,
      lang: payment.locale,
      email: payment.email,
      description: invoiceDescription(payment.locale, payment.received_at),
    }),
    record: async (payment, document) => {
      await rpc(service, 'svc_record_invoice', {
        p_gateway: payment.gateway,
        p_transaction: payment.transaction_id,
        p_service: 'icount',
        p_document_id: document.documentId,
        p_document_url: document.documentUrl,
      });
    },
    fail: async (payment, error) => {
      await rpc(service, 'svc_invoice_failed', {
        p_gateway: payment.gateway, p_transaction: payment.transaction_id, p_error: error,
      });
    },
    log: (message) => console.error(message),
  };
}
