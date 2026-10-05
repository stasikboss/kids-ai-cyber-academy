import { describe, expect, it } from 'vitest';
import { GATE_HEADERS, signGate, verifyGate } from '../supabase/functions/_shared/gate-signature.ts';

const SECRET = 'test-secret-that-is-long-enough-for-hmac-1234';
const NOW = 1_790_000_000;

async function headersFor(overrides: { country?: string; ts?: number; auth?: string; sigAuth?: string } = {}) {
  const country = overrides.country ?? 'IL';
  const ts = overrides.ts ?? NOW;
  const auth = overrides.auth ?? 'Bearer user-a-token';
  const signature = await signGate(SECRET, { country, timestamp: ts, authorization: overrides.sigAuth ?? auth });
  return new Headers({
    authorization: auth,
    [GATE_HEADERS.country]: country,
    [GATE_HEADERS.timestamp]: String(ts),
    [GATE_HEADERS.signature]: signature,
  });
}

describe('geo-gate signature', () => {
  const options = { allowedCountries: ['IL'], nowSeconds: NOW };

  it('accepts a fresh request signed for this caller from Israel', async () => {
    expect(await verifyGate(SECRET, await headersFor(), options)).toEqual({ ok: true, country: 'IL' });
  });

  it('rejects a signature made for another user token', async () => {
    const headers = await headersFor({ auth: 'Bearer user-b-token', sigAuth: 'Bearer user-a-token' });
    expect(await verifyGate(SECRET, headers, options)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a replay older than a minute', async () => {
    const headers = await headersFor({ ts: NOW - 61 });
    expect(await verifyGate(SECRET, headers, options)).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects a signed request from outside the allowed countries', async () => {
    const headers = await headersFor({ country: 'US' });
    expect(await verifyGate(SECRET, headers, options)).toEqual({ ok: false, reason: 'country_not_allowed' });
  });

  it('rejects a forged country header', async () => {
    const headers = await headersFor({ country: 'US' });
    headers.set(GATE_HEADERS.country, 'IL');
    expect(await verifyGate(SECRET, headers, options)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects missing headers and short secrets', async () => {
    expect(await verifyGate(SECRET, new Headers(), options)).toEqual({ ok: false, reason: 'missing' });
    await expect(signGate('short', { country: 'IL', timestamp: NOW, authorization: 'x' })).rejects.toThrow();
  });
});
