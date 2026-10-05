/**
 * Grow (formerly Meshulam) payment gateway, server side only.
 *
 * From Grow's developer docs (developers.grow.business, read 2026-10-05):
 *   - Base URLs: sandbox.meshulam.co.il and secure.meshulam.co.il, /api/light/server/1.0.
 *     Requests must come from a server; browsers are blocked.
 *   - A payment page link from createPaymentProcess is valid for 10 minutes.
 *   - The server-to-server callback is a form POST (not JSON) to notifyUrl. It carries
 *     NO signature, so it is only a hint: getTransactionInfo(pageCode, transactionId,
 *     transactionToken) is the source of truth.
 *   - For a standing order the callback fires only for the first charge; monthly
 *     charges are reported to a webhook address registered with Grow.
 *   - After a callback, call approveTransaction. Grow processes the charge even if it
 *     fails, but its integration review checks for it.
 *   - updateDirectDebit with changeStatus=2 cancels a standing order; it needs userId,
 *     transactionId, transactionToken and asmachta.
 *
 * TO CONFIRM IN GROW'S SANDBOX before launch (not in the public pages we could read):
 *   - the exact createPaymentProcess fields for a recurring page code (paymentNum,
 *     chargeDay) and its response shape {status, err, data: {url, processId, processToken}};
 *   - the getTransactionInfo response shape (fields read by parseVerifiedTransaction);
 *   - the exact fields approveTransaction expects back;
 *   - the format of the monthly-charge webhook.
 * Everything that depends on these lives in this file, and every parser fails closed:
 * an unexpected shape means "not verified", never "paid".
 */

export const GROW_BASE_URLS = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
} as const;

export interface GrowConfig {
  baseUrl: string;
  userId: string;
  /** The recurring (standing order) page code Grow issues for this business. */
  pageCode: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** What the gateway needs later to change or stop the standing order. */
// A type alias (not an interface) so it is assignable to Record<string, unknown>.
export type GrowRef = {
  transaction_id: string;
  transaction_token: string;
  asmachta: string;
};

export interface VerifiedPayment {
  transactionId: string;
  amountAgorot: number;
  asmachta: string;
  recurringId: string | null;
  checkoutId: string | null;
  ref: GrowRef;
}

/** `refused` is Grow answering "no"; otherwise the call itself failed and may be retried. */
export class GrowError extends Error {
  constructor(message: string, readonly refused: boolean) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Money and form helpers
// ---------------------------------------------------------------------------

/** "29.90" or 29.9 → 2990. Anything else is rejected rather than guessed. */
export function toAgorot(value: unknown): number | null {
  const text = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function fromAgorot(agorot: number): string {
  return `${Math.floor(agorot / 100)}.${String(agorot % 100).padStart(2, '0')}`;
}

/**
 * Reads a notification body into a nested object. Grow sends form fields such as
 * data[transactionId] and data[customFields][cField1]; JSON is accepted too, since the
 * monthly webhook's format is not documented publicly.
 */
export function parseNotificationBody(contentType: string, raw: string): Record<string, unknown> {
  if (/application\/json/i.test(contentType)) {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  }
  return nestFormEntries(new URLSearchParams(raw));
}

/** Form entries with bracketed names (a[b][c]) as a nested object. Multipart bodies use this directly. */
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function nestFormEntries(entries: Iterable<[string, string]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of entries) {
    if ((count += 1) > 200) break;
    const path = key.replace(/\]/g, '').split('[').filter(Boolean);
    // Untrusted input: never let a field name reach Object.prototype.
    if (path.length === 0 || path.length > 4 || path.some((part) => UNSAFE_KEYS.has(part))) continue;
    let node: Record<string, unknown> = out;
    path.forEach((part, index) => {
      if (index === path.length - 1) {
        node[part] = value;
      } else {
        const next = Object.hasOwn(node, part) ? node[part] : undefined;
        node[part] = next && typeof next === 'object' ? next : {};
        node = node[part] as Record<string, unknown>;
      }
    });
  }
  return out;
}

/** First value named `key` anywhere in the object, as a non-empty string. */
export function findField(source: unknown, key: string, depth = 0): string | null {
  if (!source || typeof source !== 'object' || depth > 4) return null;
  const record = source as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (typeof direct === 'number' && Number.isFinite(direct)) return String(direct);
  for (const value of Object.values(record)) {
    const found = findField(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The identifiers we need from an (untrusted) notification. */
export function notificationIds(body: Record<string, unknown>) {
  return {
    transactionId: findField(body, 'transactionId'),
    transactionToken: findField(body, 'transactionToken'),
    checkoutId: findField(body, 'cField1'),
  };
}

function toForm(fields: Record<string, unknown>, form = new FormData(), prefix = ''): FormData {
  for (const [key, value] of Object.entries(fields)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') toForm(value as Record<string, unknown>, form, name);
    else form.append(name, String(value));
  }
  return form;
}

async function post(config: GrowConfig, method: string, fields: Record<string, unknown>): Promise<Record<string, unknown>> {
  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${config.baseUrl}/${method}`, {
    method: 'POST',
    body: toForm(fields),
    signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
  });
  if (!response.ok) throw new GrowError(`${method}: HTTP ${response.status}`, false);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new GrowError(`${method}: unreadable response`, false);
  if (String(body.status) !== '1') {
    const err = body.err && typeof body.err === 'object' ? (body.err as Record<string, unknown>).message : body.err;
    throw new GrowError(`${method}: ${typeof err === 'string' && err ? err : 'refused'}`, true);
  }
  return body;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export interface PaymentPageRequest {
  amountAgorot: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Travels back in the callback as cField1; how the first payment finds its family. */
  checkoutId: string;
  email?: string;
}

export async function createPaymentPage(config: GrowConfig, request: PaymentPageRequest) {
  const body = await post(config, 'createPaymentProcess', {
    pageCode: config.pageCode,
    userId: config.userId,
    sum: fromAgorot(request.amountAgorot),
    description: request.description,
    successUrl: request.successUrl,
    cancelUrl: request.cancelUrl,
    notifyUrl: request.notifyUrl,
    cField1: request.checkoutId,
    ...(request.email ? { 'pageField[email]': request.email } : {}),
  });
  const data = body.data as Record<string, unknown> | undefined;
  const url = typeof data?.url === 'string' ? data.url : null;
  if (!url || !url.startsWith('https://')) throw new GrowError('createPaymentProcess: no payment page URL', false);
  return { url, processId: findField(data, 'processId') };
}

/**
 * The verified facts about a transaction, or null when Grow does not report it as a
 * paid transaction matching the ids we asked about.
 */
export function parseVerifiedTransaction(
  body: Record<string, unknown>,
  asked: { transactionId: string; transactionToken: string },
): VerifiedPayment | null {
  const rawData = body.data;
  const data = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return null;

  const transactionId = findField(data, 'transactionId');
  const statusCode = findField(data, 'statusCode');
  const amountAgorot = toAgorot(findField(data, 'sum'));
  const asmachta = findField(data, 'asmachta');

  if (transactionId !== asked.transactionId) return null;
  if (statusCode !== '2') return null; // 2 = paid ("שולם")
  if (amountAgorot === null || amountAgorot <= 0 || !asmachta) return null;

  return {
    transactionId,
    amountAgorot,
    asmachta,
    recurringId: findField(data, 'directDebitId'),
    checkoutId: findField(data, 'cField1'),
    ref: { transaction_id: transactionId, transaction_token: asked.transactionToken, asmachta },
  };
}

export async function verifyTransaction(
  config: GrowConfig,
  ids: { transactionId: string; transactionToken: string },
): Promise<VerifiedPayment | null> {
  let body: Record<string, unknown>;
  try {
    body = await post(config, 'getTransactionInfo', {
      pageCode: config.pageCode,
      transactionId: ids.transactionId,
      transactionToken: ids.transactionToken,
    });
  } catch (error) {
    // "Refused" means Grow does not know this transaction: not verified. Transport
    // errors propagate so the notification is retried.
    if (error instanceof GrowError && error.refused) return null;
    throw error;
  }
  return parseVerifiedTransaction(body, ids);
}

/** Acknowledges a callback by sending its data back, as Grow's docs ask. */
export async function approveTransaction(config: GrowConfig, notification: Record<string, unknown>): Promise<void> {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : notification;
  await post(config, 'approveTransaction', { pageCode: config.pageCode, ...(data as Record<string, unknown>) });
}

export function isGrowRef(value: unknown): value is GrowRef {
  const ref = value as Partial<GrowRef> | null;
  return !!ref && typeof ref.transaction_id === 'string' && typeof ref.transaction_token === 'string'
    && typeof ref.asmachta === 'string';
}

export async function stopStandingOrder(config: GrowConfig, ref: GrowRef): Promise<void> {
  await post(config, 'updateDirectDebit', {
    userId: config.userId,
    transactionId: ref.transaction_id,
    transactionToken: ref.transaction_token,
    asmachta: ref.asmachta,
    changeStatus: 2,
  });
}
