// Cloudflare Worker: Israel-only gate in front of family creation.
//
// Route: POST https://<app-domain>/api/create-family
// Cloudflare sets request.cf.country from the visitor's IP. Requests from allowed
// countries are signed (see supabase/functions/_shared/gate-signature.ts) and
// forwarded to the create-family Edge Function; everything else gets HTTP 451.
//
// A country check is a filter, not proof: a VPN gets past it. It lowers exposure to
// foreign law without removing it, alongside Hebrew marketing and Israel-only terms.

import { GATE_HEADERS, signGate } from '../../../supabase/functions/_shared/gate-signature.ts';

export interface Env {
  /** Shared with the create-family Edge Function; at least 32 random characters. */
  GATE_SECRET: string;
  /** e.g. https://<project-ref>.supabase.co/functions/v1 */
  SUPABASE_FUNCTIONS_URL: string;
  /** Publishable/anon key, sent as the apikey header Supabase's gateway expects. */
  SUPABASE_ANON_KEY?: string;
  /** Comma-separated ISO country codes. Defaults to IL. */
  ALLOWED_COUNTRIES?: string;
  /** "development" only under `wrangler dev --env dev`; enables DEV_COUNTRY_OVERRIDE. */
  ENVIRONMENT?: string;
  /** Local development has no real visitor country; ignored outside development. */
  DEV_COUNTRY_OVERRIDE?: string;
}

const MAX_BODY_BYTES = 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Cloudflare's country, unless this is a development deployment with an override set. */
export function visitorCountry(env: Env, cfCountry: string | undefined): string | undefined {
  if (env.ENVIRONMENT === 'development' && env.DEV_COUNTRY_OVERRIDE) return env.DEV_COUNTRY_OVERRIDE;
  return cfCountry;
}

export async function handle(request: Request, env: Env, country: string | undefined): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/create-family') return json(404, { error: 'not_found' });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return json(401, { error: 'unauthorized' });

  const allowed = (env.ALLOWED_COUNTRIES ?? 'IL').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const visitorCountry = (country ?? '').toUpperCase();
  if (!allowed.includes(visitorCountry)) {
    return json(451, { error: 'country_not_supported' });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signGate(env.GATE_SECRET, { country: visitorCountry, timestamp, authorization });

  const headers: Record<string, string> = {
    authorization,
    'content-type': 'application/json',
    [GATE_HEADERS.country]: visitorCountry,
    [GATE_HEADERS.timestamp]: String(timestamp),
    [GATE_HEADERS.signature]: signature,
  };
  if (env.SUPABASE_ANON_KEY) headers.apikey = env.SUPABASE_ANON_KEY;

  const upstream = await fetch(`${env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, '')}/create-family`, {
    method: 'POST',
    headers,
    body: body || '{}',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const cf = (request as Request & { cf?: { country?: string } }).cf;
    return handle(request, env, visitorCountry(env, cf?.country));
  },
};
