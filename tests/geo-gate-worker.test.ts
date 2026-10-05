import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyGate } from '../supabase/functions/_shared/gate-signature.ts';
import { type Env, handle, visitorCountry } from '../workers/geo-gate/src/index.ts';

const env: Env = {
  GATE_SECRET: 'worker-test-secret-0123456789abcdefghij',
  SUPABASE_FUNCTIONS_URL: 'https://ref.supabase.co/functions/v1/',
  SUPABASE_ANON_KEY: 'anon-key',
};

function request(init: { method?: string; auth?: string | null; path?: string; body?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (init.auth !== null) headers.set('authorization', init.auth ?? 'Bearer parent-token');
  return new Request(`https://app.example.co.il${init.path ?? '/api/create-family'}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? undefined : (init.body ?? '{"locale":"he"}'),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('geo-gate worker', () => {
  it('signs and forwards requests from Israel', async () => {
    const upstream = vi.fn(async (_url: string, _init: RequestInit) => new Response('{"family_id":"f1"}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);

    const response = await handle(request(), env, 'IL');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ family_id: 'f1' });
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe('https://ref.supabase.co/functions/v1/create-family');
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe('anon-key');
    expect(await verifyGate(env.GATE_SECRET, headers, { allowedCountries: ['IL'] }))
      .toEqual({ ok: true, country: 'IL' });
  });

  it('returns 451 outside Israel without calling Supabase', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    for (const country of ['US', 'DE', undefined]) {
      const response = await handle(request(), env, country);
      expect(response.status).toBe(451);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('honours the country override only in development', () => {
    expect(visitorCountry({ ...env, DEV_COUNTRY_OVERRIDE: 'IL' }, 'US')).toBe('US');
    expect(visitorCountry({ ...env, ENVIRONMENT: 'production', DEV_COUNTRY_OVERRIDE: 'IL' }, 'US')).toBe('US');
    expect(visitorCountry({ ...env, ENVIRONMENT: 'development', DEV_COUNTRY_OVERRIDE: 'IL' }, undefined)).toBe('IL');
  });

  it('rejects unauthenticated, wrong-method, wrong-path and oversized requests', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await handle(request({ auth: null }), env, 'IL')).status).toBe(401);
    expect((await handle(request({ method: 'GET' }), env, 'IL')).status).toBe(405);
    expect((await handle(request({ path: '/api/other' }), env, 'IL')).status).toBe(404);
    expect((await handle(request({ body: 'x'.repeat(2000) }), env, 'IL')).status).toBe(413);
  });
});
