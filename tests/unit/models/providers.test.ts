import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../../src/models/anthropic.js';
import { OpenAIProvider } from '../../../src/models/openai.js';
import { GeminiProvider } from '../../../src/models/google.js';
import { OpenRouterProvider } from '../../../src/models/openrouter.js';
import type { ModelConfig } from '../../../src/config/type.js';
import type { ChatMessage } from '../../../src/chat/types.js';
import type { LLMProvider, StreamChunk, ToolDefinition } from '../../../src/models/types.js';

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

async function collectChunks(
  provider: LLMProvider,
  config: ModelConfig,
  tools?: ToolDefinition[],
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of provider.sendMessage(messages, config, undefined, tools)) {
    chunks.push(chunk);
  }
  return chunks;
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
    await expect(collect(provider, configWith('openai'))).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('OpenAI-compatible tool calling', () => {
  it('accumulates streaming tool_calls deltas into a tool chunk', async () => {
    process.env.TEST_API_KEY = 'k';
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Paris\\"}"}}]},"finish_reason":"tool_calls"}]}',
        '',
      ]),
    );
    const chunks = await collectChunks(new OpenAIProvider(), configWith('openai'), [
      { name: 'get_weather', description: 'x' },
    ]);
    const toolChunks = chunks.filter((c) => c.type === 'tool');
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0].tool).toEqual({
      id: 'call_1',
      name: 'get_weather',
      arguments: '{"city":"Paris"}',
    });
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('sends tools and serializes tool messages in the request body', async () => {
    process.env.TEST_API_KEY = 'k';
    let capturedBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        capturedBody = JSON.parse(init?.body ?? '{}');
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"done"}}]}',
          '',
          'data: [DONE]',
          '',
        ]);
      }),
    );

    const toolMessages: ChatMessage[] = [
      { id: 'a', role: 'user', content: 'query', timestamp: new Date() },
      {
        id: 'b',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [{ id: 'call_1', name: 'srv__find', arguments: '{"q":"x"}' }],
      },
      { id: 'c', role: 'tool', content: 'result', timestamp: new Date(), toolCallId: 'call_1' },
    ];

    const out = '';
    for await (const chunk of new OpenAIProvider().sendMessage(
      toolMessages,
      configWith('openai'),
      undefined,
      [{ name: 'srv__find', description: 'Find things', inputSchema: { type: 'object' } }],
    )) {
      expect(chunk.type).toBeTruthy();
      if (chunk.type === 'content') out.length;
    }

    const body = capturedBody as { tools?: unknown; messages?: unknown };
    const tools = body.tools as Array<{ type: string; function: { name: string } }>;
    expect(tools).toEqual([
      {
        type: 'function',
        function: { name: 'srv__find', description: 'Find things', parameters: { type: 'object' } },
      },
    ]);
    const msgs = body.messages as Array<Record<string, unknown>>;
    expect(msgs[1].tool_calls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'srv__find', arguments: '{"q":"x"}' } },
    ]);
    expect(msgs[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: 'result' });
  });
});
