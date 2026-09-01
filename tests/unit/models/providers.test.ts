import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../../src/models/anthropic.js';
import { OpenAIProvider } from '../../../src/models/openai.js';
import { GeminiProvider } from '../../../src/models/google.js';
import { OpenRouterProvider } from '../../../src/models/openrouter.js';
import type { ModelConfig } from '../../../src/config/type.js';
import type { ChatMessage } from '../../../src/chat/types.js';
import type { LLMProvider } from '../../../src/models/types.js';

const messages: ChatMessage[] = [
  { id: '1', role: 'user', content: 'hi', timestamp: new Date() },
];

function sseResponse(events: string[]): Response {
  const body = events.join('\n');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function mockFetch(body: Response | (() => Response)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (typeof body === 'function' ? body() : body)),
  );
}

async function collect(provider: LLMProvider, config: ModelConfig): Promise<string> {
  let out = '';
  for await (const chunk of provider.sendMessage(messages, config)) {
    if (chunk.type === 'content') out += chunk.content;
  }
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function configWith(provider: ModelConfig['provider'], overrides: Partial<ModelConfig> = {}): ModelConfig {
  return { provider, model: 'test-model', api_key_env: 'TEST_API_KEY', ...overrides };
}

describe('provider streaming', () => {
  it('Anthropic extracts text_delta content', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
        '',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
        '',
      ]),
    );
    expect(await collect(new AnthropicProvider(), configWith('anthropic'))).toBe('Hello');
  });

  it('OpenAI extracts delta content', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hi "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"there"}}]}',
        '',
        'data: [DONE]',
        '',
      ]),
    );
    expect(await collect(new OpenAIProvider(), configWith('openai'))).toBe('Hi there');
  });

  it('Gemini extracts candidate text', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Yo"}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"!"}]}}]}',
        '',
      ]),
    );
    expect(await collect(new GeminiProvider(), configWith('google'))).toBe('Yo!');
  });

  it('OpenRouter extracts delta content', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hey"}}]}',
        '',
        'data: [DONE]',
        '',
      ]),
    );
    expect(await collect(new OpenRouterProvider(), configWith('openrouter'))).toBe('Hey');
  });

  it('throws a friendly error when the API key env var is missing', async () => {
    delete process.env.MISSING_KEY;
    const provider = new OpenAIProvider();
    await expect(
      collect(provider, configWith('openai', { api_key_env: 'MISSING_KEY' })),
    ).rejects.toThrow(/MISSING_KEY/);
  });

  it('surfaces non-2xx API errors', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(new Response('boom', { status: 401 }));
    const provider = new OpenAIProvider();
    await expect(collect(provider, configWith('openai'))).rejects.toThrow(/OpenAI API error \(401\)/);
  });
});
