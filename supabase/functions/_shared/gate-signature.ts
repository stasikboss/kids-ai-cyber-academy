/**
 * The Cloudflare Worker that enforces the Israel-only launch signs every request it
 * forwards to the create-family Edge Function. The signature binds the visitor's
 * country, a timestamp and the caller's bearer token, so it cannot be replayed for a
 * different user or reused after MAX_SKEW_SECONDS.
 */

export const GATE_HEADERS = {
  country: 'x-gate-country',
  timestamp: 'x-gate-ts',
  signature: 'x-gate-signature',
} as const;

export const MAX_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface GateInput {
  country: string;
  timestamp: number;
  authorization: string;
}

export async function signGate(secret: string, input: GateInput): Promise<string> {
  if (secret.length < 32) throw new Error('GATE_SECRET must be at least 32 characters');
  const message = `${input.timestamp}.${input.country}.${await sha256Hex(input.authorization)}`;
  return hmacHex(secret, message);
}

export type GateVerdict =
  | { ok: true; country: string }
  | { ok: false; reason: 'missing' | 'stale' | 'bad_signature' | 'country_not_allowed' };

export async function verifyGate(
  secret: string,
  headers: Headers,
  options: { allowedCountries: string[]; nowSeconds?: number },
): Promise<GateVerdict> {
  const country = headers.get(GATE_HEADERS.country);
  const timestampRaw = headers.get(GATE_HEADERS.timestamp);
  const signature = headers.get(GATE_HEADERS.signature);
  const authorization = headers.get('authorization');
  if (!country || !timestampRaw || !signature || !authorization) return { ok: false, reason: 'missing' };

  const timestamp = Number(timestampRaw);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }

  const expected = await signGate(secret, { country, timestamp, authorization });
  if (!constantTimeEqual(expected, signature)) return { ok: false, reason: 'bad_signature' };

  if (!options.allowedCountries.includes(country)) return { ok: false, reason: 'country_not_allowed' };
  return { ok: true, country };
}
