import { afterEach, describe, expect, it } from 'vitest';
import { searchWeb, webSearchTool } from '../../../src/tools/tavily.js';
import { SiloError } from '../../../src/error/index.js';

const ORIGINAL = { ...(process.env as Record<string, string | undefined>) };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, ORIGINAL);
});

function fakeFetch(response: { ok?: boolean; status?: number; body: unknown }): typeof fetch {
  return (async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: async () => JSON.stringify(response.body),
      json: async () => response.body,
    }) as Response) as typeof fetch;
}

describe('searchWeb', () => {
  it('returns parsed results from Tavily', async () => {
    const fetchFn = fakeFetch({
      body: {
        results: [
          { title: 'Silo docs', url: 'https://example.com', content: 'A great tool.', score: 0.9 },
          { title: 'Another', url: 'https://example.org', content: 'More info.', score: 0.8 },
        ],
      },
    });
    const results = await searchWeb({ query: 'silo', apiKey: 'k', fetchFn });
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Silo docs');
  });

  it('sends the query and key in the request body', async () => {
    const box: { url?: string; body?: string } = {};
    const fetchFn = (async (url: string, init?: RequestInit) => {
      box.url = url;
      box.body = String(init?.body);
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) } as Response;
    }) as typeof fetch;
    await searchWeb({ query: 'hello', apiKey: 'secret', maxResults: 3, fetchFn });
    expect(box.url).toBe('https://api.tavily.com/search');
    const body = JSON.parse(box.body ?? '{}') as {
      api_key: string;
      query: string;
      max_results: number;
      search_depth: string;
    };
    expect(body).toEqual({ api_key: 'secret', query: 'hello', max_results: 3, search_depth: 'basic' });
  });

  it('surfaces HTTP errors from Tavily', async () => {
    const fetchFn = fakeFetch({ ok: false, status: 401, body: { detail: 'nope' } });
    await expect(searchWeb({ query: 'x', apiKey: 'bad', fetchFn })).rejects.toThrow(
      /HTTP 401.*Tavily API key/,
    );
  });

  it('wraps transport failures in a SiloError', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    await expect(searchWeb({ query: 'x', apiKey: 'k', fetchFn })).rejects.toThrow(SiloError);
  });
});

describe('webSearchTool', () => {
  it('is null when the Tavily key is missing', () => {
    expect(webSearchTool({ api_key_env: 'TAVILY_API_KEY' })).toBeNull();
  });

  it('is null when disabled', () => {
    process.env.TAVILY_API_KEY = 'k';
    expect(webSearchTool({ enabled: false, api_key_env: 'TAVILY_API_KEY' })).toBeNull();
  });

  it('advertises a namespaced web_search tool when the key exists', () => {
    process.env.TAVILY_API_KEY = 'k';
    const tool = webSearchTool({ api_key_env: 'TAVILY_API_KEY' });
    expect(tool).not.toBeNull();
    expect(tool?.namespace).toBe('builtin');
    expect(tool?.name).toBe('web_search');
  });

  it('rejects a missing query argument', async () => {
    process.env.TAVILY_API_KEY = 'k';
    const tool = webSearchTool({ api_key_env: 'TAVILY_API_KEY' });
    await expect(tool?.run({})).rejects.toThrow(/non-empty "query"/);
  });

  it('passes an explicit max_results through to the search', async () => {
    process.env.TAVILY_API_KEY = 'k';
    const tool = webSearchTool({ api_key_env: 'TAVILY_API_KEY' });
    const box: { maxResults?: number } = {};
    const origFetch = globalThis.fetch;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body)) as { max_results?: number };
      box.maxResults = parsed.max_results;
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) } as Response;
    }) as typeof fetch;
    globalThis.fetch = fetchFn as typeof globalThis.fetch;
    try {
      await tool?.run({ query: 'x', max_results: 7 });
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(box.maxResults).toBe(7);
  });
});