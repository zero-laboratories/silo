import { SiloError } from '../error/index.js';
import type { BuiltinTool } from './types.js';

const LITE_ENDPOINT = 'https://lite.duckduckgo.com/lite/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export interface DdgResult {
  title: string;
  url: string;
  snippet: string;
}

export interface DdgSearchConfig {
  enabled?: boolean;
  max_results?: number;
  region?: string;
  safesearch?: number;
}

export interface DdgSearchOptions {
  query: string;
  maxResults?: number;
  region?: string;
  safesearch?: number;
  fetchFn?: typeof fetch;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z0-9]+);/gi, (match, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = parseInt(lower.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (lower.startsWith('#')) {
      const code = parseInt(lower.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function matchAttrs(attrBlock: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of attrBlock.matchAll(re)) {
    attrs[m[1]] = m[2] ?? m[3] ?? '';
  }
  return attrs;
}

function resolveUrl(href: string): string {
  let out = href;
  if (out.startsWith('//')) out = `https:${out}`;
  const uddg = /(?:^|[?&])uddg=([^&]+)/.exec(out);
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch {
      return out;
    }
  }
  return out;
}

interface LinkEvent {
  kind: 'link';
  pos: number;
  attrs: Record<string, string>;
  inner: string;
}

interface SnippetEvent {
  kind: 'snippet';
  pos: number;
  text: string;
}

export function parseLiteResults(html: string): DdgResult[] {
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const snippetRe = /class\s*=\s*['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi;

  const events: Array<LinkEvent | SnippetEvent> = [];
  for (const m of html.matchAll(linkRe)) {
    const attrs = matchAttrs(m[1] ?? '');
    if (!attrs.class?.includes('result-link')) continue;
    events.push({ kind: 'link', pos: m.index, attrs, inner: m[2] ?? '' });
  }
  for (const m of html.matchAll(snippetRe)) {
    events.push({ kind: 'snippet', pos: m.index, text: m[1] ?? '' });
  }
  events.sort((a, b) => a.pos - b.pos);

  const results: DdgResult[] = [];
  let current: DdgResult | null = null;
  for (const event of events) {
    if (event.kind === 'link') {
      current = {
        title: stripTags(event.inner),
        url: resolveUrl(event.attrs.href ?? ''),
        snippet: '',
      };
      results.push(current);
    } else if (current && current.snippet === '') {
      current.snippet = stripTags(event.text);
    }
  }
  return results;
}

export function isBlockedPage(html: string): boolean {
  return /anomaly|captcha|challenge|verify/iu.test(html);
}

export async function ddgLiteSearch(opts: DdgSearchOptions): Promise<DdgResult[]> {
  const maxResults = Math.min(opts.maxResults ?? 5, 10);
  const params = new URLSearchParams({
    q: opts.query,
    kl: opts.region ?? 'wt-wt',
    kp: String(opts.safesearch ?? -1),
  });
  const url = `${LITE_ENDPOINT}?${params.toString()}`;
  const fetchFn = opts.fetchFn ?? fetch;

  let response: Response;
  let html: string;
  try {
    response = await fetchFn(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      },
    });
    html = await response.text();
  } catch (err) {
    throw new SiloError(`Web search failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    throw new SiloError(`Web search returned HTTP ${response.status}.`);
  }

  if (isBlockedPage(html) && !html.includes('result-link')) {
    throw new SiloError(
      'DuckDuckGo blocked the request (captcha/anomaly detection). Try again or use a different network.',
    );
  }

  return parseLiteResults(html).slice(0, maxResults);
}

function formatResults(results: DdgResult[]): string {
  if (results.length === 0) return 'No results found.';
  return results
    .map((r, i) => {
      const snippet = r.snippet.length > 300 ? `${r.snippet.slice(0, 300)}…` : r.snippet;
      return `${i + 1}. ${r.title}\n   ${r.url}${snippet ? `\n   ${snippet}` : ''}`;
    })
    .join('\n\n');
}

export function ddgSearchTool(config: DdgSearchConfig = {}): BuiltinTool | null {
  if (config.enabled === false) return null;
  return {
    namespace: 'builtin',
    name: 'web_search',
    description:
      'Search the web for current information, news, recent events, or anything outside the model' +
      ' training data. Returns a list of results with title, URL, and a snippet. Free and keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: {
          type: 'number',
          description: 'How many results to return (default 5, max 10)',
        },
        region: {
          type: 'string',
          description: 'DDG region code, e.g. wt-wt (worldwide) or us-en (default wt-wt)',
        },
      },
      required: ['query'],
    },
    run: async (args: unknown) => {
      const { query, max_results: maxResults, region } = (args ?? {}) as {
        query?: unknown;
        max_results?: unknown;
        region?: unknown;
      };
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new SiloError('Web search requires a non-empty "query" argument.');
      }
      const results = await ddgLiteSearch({
        query: query.trim(),
        maxResults: typeof maxResults === 'number' ? maxResults : config.max_results,
        region: typeof region === 'string' && region.trim() ? region : config.region,
        safesearch: config.safesearch,
      });
      return formatResults(results);
    },
  };
}