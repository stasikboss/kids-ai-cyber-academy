/**
 * iCount invoicing: one tax invoice-receipt (חשבונית מס קבלה, doctype "invrec") per
 * payment, emailed to the parent.
 *
 * UNVERIFIED. iCount's API reference (https://api.icount.co.il/api/v3.php/doc/create)
 * could not be read while this was written, so the request fields below follow iCount
 * API v3 as commonly integrated and MUST be checked against that page, and one real
 * document issued in iCount's test company, before launch. Everything that depends on
 * iCount's field names is in this file. The response parser fails closed: no document
 * number and URL means the attempt failed and the payment stays in the retry queue.
 *
 * To check with the accountant: issuing to "Private customer" without a name, and that
 * the amount is VAT-inclusive.
 */

export interface IcountConfig {
  baseUrl?: string;
  companyId: string;
  user: string;
  password: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface InvoiceRequest {
  amountAgorot: number;
  lang: 'he' | 'en';
  email: string | null;
  /** Shown on the document, e.g. "Family plan, October 2026". */
  description: string;
}

export interface IssuedDocument {
  documentId: string;
  documentUrl: string | null;
}

export class IcountError extends Error {}

const CUSTOMER_NAME = { he: 'לקוח פרטי', en: 'Private customer' } as const;

export function invoiceBody(config: IcountConfig, request: InvoiceRequest): Record<string, unknown> {
  const sum = request.amountAgorot / 100;
  return {
    cid: config.companyId,
    user: config.user,
    pass: config.password,
    doctype: 'invrec',
    lang: request.lang,
    currency_code: 'ILS',
    client_name: CUSTOMER_NAME[request.lang],
    ...(request.email ? { email: request.email, send_email: 1, email_to_client: 1 } : {}),
    items: [{ description: request.description, unitprice_incvat: sum, quantity: 1 }],
    cc: { sum, num_of_payments: 1 },
  };
}

export function parseIssued(body: unknown): IssuedDocument {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (record.status !== true && record.status !== 1 && record.status !== '1') {
    const reason = typeof record.reason === 'string' ? record.reason : 'refused';
    throw new IcountError(`iCount refused the document: ${reason}`);
  }
  const docnum = record.docnum ?? record.doc_number;
  if (typeof docnum !== 'string' && typeof docnum !== 'number') {
    throw new IcountError('iCount response has no document number');
  }
  const url = typeof record.doc_url === 'string' && record.doc_url.startsWith('https://') ? record.doc_url : null;
  return { documentId: String(docnum), documentUrl: url };
}

export async function issueInvoiceReceipt(config: IcountConfig, request: InvoiceRequest): Promise<IssuedDocument> {
  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${config.baseUrl ?? 'https://api.icount.co.il/api/v3.php'}/doc/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(invoiceBody(config, request)),
    signal: AbortSignal.timeout(config.timeoutMs ?? 20_000),
  });
  if (!response.ok) throw new IcountError(`iCount HTTP ${response.status}`);
  return parseIssued(await response.json().catch(() => null));
}
