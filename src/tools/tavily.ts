import { SiloError } from '../error/index.js';
import type { BuiltinTool } from './types.js';

const ENDPOINT = 'https://api.tavily.com/search';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface WebSearchConfig {
  enabled?: boolean;
  api_key_env?: string;
  max_results?: number;
}

export interface SearchOptions {
  query: string;
  apiKey: string;
  maxResults?: number;
  fetchFn?: typeof fetch;
}

export async function searchWeb(opts: SearchOptions): Promise<TavilyResult[]> {
  const maxResults = opts.maxResults ?? 5;
  const fetchFn = opts.fetchFn ?? fetch;
  const body = {
    api_key: opts.apiKey,
    query: opts.query,
    max_results: maxResults,
    search_depth: 'basic',
  };

  let response: Response;
  try {
    response = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new SiloError(`Web search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new SiloError(
      `Web search returned HTTP ${response.status}. Check your Tavily API key.${detail ? ` (${detail.slice(0, 200)})` : ''}`,
    );
  }

  let data: { results?: TavilyResult[] };
  try {
    data = (await response.json()) as { results?: TavilyResult[] };
  } catch {
    throw new SiloError('Web search returned an invalid response from Tavily.');
  }

  return data.results ?? [];
}

function formatResults(results: TavilyResult[]): string {
  if (results.length === 0) return 'No results found.';
  return results
    .map((r, i) => {
      const content = r.content.replace(/\s+/g, ' ').trim();
      return `${i + 1}. ${r.title}\n   ${r.url}\n   ${content.length > 500 ? content.slice(0, 500) + '…' : content}`;
    })
    .join('\n\n');
}

export function webSearchTool(config: WebSearchConfig = {}): BuiltinTool | null {
  if (config.enabled === false) return null;
  const key = config.api_key_env ? (process.env[config.api_key_env] ?? '') : '';
  if (!key) return null;

  return {
    namespace: 'builtin',
    name: 'web_search',
    description:
      'Search the web for current information, news, recent events, or anything outside the model' +
      ' training data. Returns a list of results with title, URL, and a snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: { type: 'number', description: 'How many results to return (default 5, max 10)' },
      },
      required: ['query'],
    },
    run: async (args: unknown) => {
      const { query, max_results: maxResults } = (args ?? {}) as {
        query?: unknown;
        max_results?: unknown;
      };
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new SiloError('Web search requires a non-empty "query" argument.');
      }
      const results = await searchWeb({
        query: query.trim(),
        apiKey: key,
        maxResults: typeof maxResults === 'number' ? maxResults : config.max_results,
      });
      return formatResults(results);
    },
  };
}