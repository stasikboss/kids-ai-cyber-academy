import { describe, expect, it } from 'vitest';
import {
  createPaymentPage, findField, fromAgorot, GROW_BASE_URLS, type GrowConfig, nestFormEntries,
  notificationIds, parseNotificationBody, parseVerifiedTransaction, stopStandingOrder, toAgorot,
  verifyTransaction,
} from '../supabase/functions/_shared/grow.ts';
import { invoiceBody, parseIssued } from '../supabase/functions/_shared/icount.ts';

/** A fake fetch that records form posts and answers with the given JSON. */
function fakeGrow(answer: unknown, status = 200) {
  const calls: Array<{ url: string; fields: Record<string, string> }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const fields: Record<string, string> = {};
    (init?.body as FormData).forEach((v, k) => { fields[k] = String(v); });
    calls.push({ url: String(url), fields });
    return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const config: GrowConfig = { baseUrl: GROW_BASE_URLS.sandbox, userId: 'user-1', pageCode: 'page-1', fetch: fetchImpl };
  return { config, calls };
}

const PAID = {
  status: 1,
  err: '',
  data: {
    transactionId: '6121277', statusCode: '2', sum: '29.90', asmachta: '43221726',
    directDebitId: '33333885', customFields: { cField1: 'c0ffee00-0000-4000-8000-000000000001' },
  },
};

describe('money', () => {
  it('converts shekels to agorot exactly and refuses anything ambiguous', () => {
    expect(toAgorot('29.90')).toBe(2990);
    expect(toAgorot('29.9')).toBe(2990);
    expect(toAgorot('30')).toBe(3000);
    expect(toAgorot(29.9)).toBe(2990);
    expect(toAgorot('0.07')).toBe(7);
    for (const bad of ['', '29,90', '-5', '1e3', '29.901', 'abc', null, undefined, {}]) {
      expect(toAgorot(bad), String(bad)).toBeNull();
    }
    expect(fromAgorot(2990)).toBe('29.90');
    expect(fromAgorot(5)).toBe('0.05');
  });
});

describe('notification parsing', () => {
  it('reads bracketed form fields and JSON into the ids we need', () => {
    const form = 'status=1&data%5BtransactionId%5D=6121277&data%5BtransactionToken%5D=tok&data%5BcustomFields%5D%5BcField1%5D=chk';
    const body = parseNotificationBody('application/x-www-form-urlencoded', form);
    expect(notificationIds(body)).toEqual({ transactionId: '6121277', transactionToken: 'tok', checkoutId: 'chk' });

    const json = parseNotificationBody('application/json', JSON.stringify({ transactionId: 7, transactionToken: 't' }));
    expect(notificationIds(json)).toEqual({ transactionId: '7', transactionToken: 't', checkoutId: null });
  });

  it('never lets a field name reach Object.prototype', () => {
    const body = nestFormEntries([
      ['__proto__[polluted]', 'yes'],
      ['__proto__[transactionToken]', 'injected'],
      ['data[constructor][prototype][polluted]', 'yes'],
      ['data[transactionId]', '1'],
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
    expect(findField(body, 'transactionToken')).toBeNull();
    expect(findField(body, 'transactionId')).toBe('1');
  });
});

describe('verification', () => {
  const asked = { transactionId: '6121277', transactionToken: 'tok' };

  it('accepts only a paid transaction that matches what was asked', () => {
    expect(parseVerifiedTransaction(PAID, asked)).toEqual({
      transactionId: '6121277',
      amountAgorot: 2990,
      asmachta: '43221726',
      recurringId: '33333885',
      checkoutId: 'c0ffee00-0000-4000-8000-000000000001',
      ref: { transaction_id: '6121277', transaction_token: 'tok', asmachta: '43221726' },
    });
    const unpaid = { ...PAID, data: { ...PAID.data, statusCode: '3' } };
    const other = { ...PAID, data: { ...PAID.data, transactionId: '999' } };
    const noSum = { ...PAID, data: { ...PAID.data, sum: undefined } };
    const noAsmachta = { ...PAID, data: { ...PAID.data, asmachta: '' } };
    for (const body of [unpaid, other, noSum, noAsmachta, { status: 1 }, { status: 1, data: [] }]) {
      expect(parseVerifiedTransaction(body as Record<string, unknown>, asked)).toBeNull();
    }
  });

  it('asks Grow with the page code and treats a refusal as not verified', async () => {
    const ok = fakeGrow(PAID);
    expect(await verifyTransaction(ok.config, asked)).not.toBeNull();
    expect(ok.calls[0]).toEqual({
      url: `${GROW_BASE_URLS.sandbox}/getTransactionInfo`,
      fields: { pageCode: 'page-1', transactionId: '6121277', transactionToken: 'tok' },
    });

    const refused = fakeGrow({ status: 0, err: { message: 'not found' } });
    expect(await verifyTransaction(refused.config, asked)).toBeNull();

    // A transport failure is not a "no": it propagates so the notification is retried.
    const down = fakeGrow({}, 503);
    await expect(verifyTransaction(down.config, asked)).rejects.toThrow(/HTTP 503/);
  });
});

describe('requests to Grow', () => {
  it('creates a payment page with the server-set amount and the checkout id', async () => {
    const grow = fakeGrow({ status: 1, data: { url: 'https://sandbox.meshulam.co.il/pay/abc', processId: 42, processToken: 'p' } });
    const page = await createPaymentPage(grow.config, {
      amountAgorot: 2990, description: 'Family plan, monthly', successUrl: 'https://app/s', cancelUrl: 'https://app/c',
      notifyUrl: 'https://fn/billing-webhook?k=x', checkoutId: 'chk-1', email: 'p@example.test',
    });
    expect(page).toEqual({ url: 'https://sandbox.meshulam.co.il/pay/abc', processId: '42' });
    expect(grow.calls[0]!.fields).toMatchObject({
      pageCode: 'page-1', userId: 'user-1', sum: '29.90', cField1: 'chk-1', 'pageField[email]': 'p@example.test',
    });

    const noUrl = fakeGrow({ status: 1, data: { url: 'http://insecure' } });
    await expect(createPaymentPage(noUrl.config, {
      amountAgorot: 2990, description: 'x', successUrl: 's', cancelUrl: 'c', notifyUrl: 'n', checkoutId: 'chk',
    })).rejects.toThrow(/no payment page URL/);
  });

  it('cancels a standing order with changeStatus 2', async () => {
    const grow = fakeGrow({ status: 1 });
    await stopStandingOrder(grow.config, { transaction_id: '1', transaction_token: 't', asmachta: 'a' });
    expect(grow.calls[0]).toEqual({
      url: `${GROW_BASE_URLS.sandbox}/updateDirectDebit`,
      fields: { userId: 'user-1', transactionId: '1', transactionToken: 't', asmachta: 'a', changeStatus: '2' },
    });
  });
});

describe('iCount document', () => {
  it('builds one VAT-inclusive line and needs a document number back', () => {
    const body = invoiceBody({ companyId: 'c', user: 'u', password: 'p' }, {
      amountAgorot: 2990, lang: 'he', email: 'p@example.test', description: 'תוכנית משפחתית, אוקטובר 2026',
    });
    expect(body).toMatchObject({
      doctype: 'invrec', currency_code: 'ILS', client_name: 'לקוח פרטי', email: 'p@example.test',
      items: [{ unitprice_incvat: 29.9, quantity: 1 }],
    });
    expect(parseIssued({ status: true, docnum: 1001, doc_url: 'https://app.icount.co.il/doc/1001' }))
      .toEqual({ documentId: '1001', documentUrl: 'https://app.icount.co.il/doc/1001' });
    expect(() => parseIssued({ status: false, reason: 'bad_login' })).toThrow(/bad_login/);
    expect(() => parseIssued({ status: true })).toThrow(/no document number/);
  });
});
