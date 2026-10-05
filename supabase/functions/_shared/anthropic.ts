/**
 * Minimal Claude Messages API client over fetch, so the same code runs in Deno Edge
 * Functions and in Node tests without an SDK. Only what the tutor needs: a short
 * non-streaming call for classifiers and a streaming call for answers.
 */

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface MessageParam {
  role: 'user' | 'assistant';
  content: string;
}

export interface MessageRequest {
  model: string;
  system: string;
  messages: MessageParam[];
  max_tokens: number;
  temperature?: number;
  /** Marks the system prompt cacheable; it is identical across a child's turns. */
  cacheSystem?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type StreamEvent = { type: 'text'; text: string } | { type: 'usage'; usage: Usage };

export class AnthropicError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AnthropicError';
  }
}

function buildBody(request: MessageRequest, stream: boolean) {
  return {
    model: request.model,
    max_tokens: request.max_tokens,
    temperature: request.temperature ?? 0,
    stream,
    system: [
      {
        type: 'text',
        text: request.system,
        ...(request.cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}),
      },
    ],
    messages: request.messages,
  };
}

async function post(config: AnthropicConfig, body: unknown, signal?: AbortSignal): Promise<Response> {
  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AnthropicError(`Claude API ${response.status}: ${detail.slice(0, 300)}`, response.status);
  }
  return response;
}

interface MessageResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

export async function createMessage(
  config: AnthropicConfig,
  request: MessageRequest,
  signal?: AbortSignal,
): Promise<{ text: string; usage: Usage }> {
  const response = await post(config, buildBody(request, false), signal);
  const json = (await response.json()) as MessageResponse;
  const text = json.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  return { text, usage: usageOf(json.usage) };
}

function usageOf(u: MessageResponse['usage'] | undefined): Usage {
  return {
    inputTokens: (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0),
    outputTokens: u?.output_tokens ?? 0,
  };
}

export async function* streamMessage(
  config: AnthropicConfig,
  request: MessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await post(config, buildBody(request, true), signal);
  if (!response.body) throw new AnthropicError('Claude API returned no stream body');
  yield* parseAnthropicStream(response.body);
}

/** Parses the server-sent event stream of a streaming Messages API response. */
export async function* parseAnthropicStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode();

      let separator: number;
      while ((separator = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, '');

        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;

        const event = JSON.parse(data) as {
          type: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: MessageResponse['usage'] };
          usage?: { output_tokens?: number };
          error?: { message?: string };
        };

        switch (event.type) {
          case 'message_start':
            inputTokens = usageOf(event.message?.usage).inputTokens;
            break;
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              yield { type: 'text', text: event.delta.text };
            }
            break;
          case 'message_delta':
            outputTokens = event.usage?.output_tokens ?? outputTokens;
            break;
          case 'error':
            throw new AnthropicError(`Claude stream error: ${event.error?.message ?? 'unknown'}`);
          default:
            break;
        }
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'usage', usage: { inputTokens, outputTokens } };
}
