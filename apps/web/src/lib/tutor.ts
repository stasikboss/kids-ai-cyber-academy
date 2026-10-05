import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase.ts';
import type { Lang } from './types.ts';

/** Mirrors TutorEvent in supabase/functions/_shared/tutor-pipeline.ts. */
export type TutorEvent =
  | { type: 'notice'; kind: string; text: string }
  | { type: 'sentence'; text: string }
  | { type: 'replace'; text: string }
  | { type: 'done'; used: number | null; limit: number | null };

/** Streams one tutor turn. Calls onEvent for each server-sent event in order. */
export async function askTutor(
  params: { childId: string; message: string; lang: Lang; signal?: AbortSignal },
  onEvent: (event: TutorEvent) => void,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not_signed_in');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/tutor-chat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ child_id: params.childId, message: params.message, lang: params.lang }),
    signal: params.signal,
  });
  if (!response.ok || !response.body) throw new Error(`tutor_http_${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
      if (dataLine) onEvent(JSON.parse(dataLine.slice(5).trim()) as TutorEvent);
    }
    if (done) break;
  }
}
