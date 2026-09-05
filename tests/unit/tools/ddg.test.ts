import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ddgLiteSearch, ddgSearchTool, decodeEntities, parseLiteResults } from '../../../src/tools/ddg.js';
import { SiloError } from '../../../src/error/index.js';

const fixtureHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'ddg-lite.html'),
  'utf8',
);

function fakeFetch(html: string, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({
      ok,
      status,
      text: async () => html,
    }) as Response) as typeof fetch;
}

describe('parseLiteResults', () => {
  it('parses titles, redirect URLs, and snippets from real DDG Lite markup', () => {
    const results = parseLiteResults(fixtureHtml);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('The Complete Works of Hack G U PS2 Saga Trilogy Limited Box Japan - eBay');
    expect(results[0].url).toBe('https://www.ebay.com/itm/355998096145');
    expect(results[0].snippet).toContain('The Complete Works of Hack G U');
    expect(results[0].snippet).not.toContain('<b>');
    expect(results[1].title).toContain('Complete Works of Hack G U');
    expect(results[1].snippet.length).toBeGreaterThan(0);
    expect(results[1].url.startsWith('https://')).toBe(true);
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&amp; &lt;b&gt; &#39; &#x27; &quot;')).toBe("& <b> ' ' \"");
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });
});

describe('ddgLiteSearch', () => {
  it('fetches the Lite endpoint and returns parsed results', async () => {
    let capturedUrl = '';
    const fetchFn = (async (url: string) => {
      capturedUrl = String(url);
      return { ok: true, status: 200, text: async () => fixtureHtml } as Response;
    }) as typeof fetch;
    const results = await ddgLiteSearch({ query: 'complete works hacker', fetchFn });
    expect(results).toHaveLength(2);
    expect(capturedUrl).toContain('lite.duckduckgo.com/lite/?');
    expect(capturedUrl).toContain('q=complete+works+hacker');
    expect(capturedUrl).toContain('kl=wt-wt');
  });

  it('caps results and honours region/safesearch params', async () => {
    let capturedUrl = '';
    const fetchFn = (async (url: string) => {
      capturedUrl = String(url);
      return { ok: true, status: 200, text: async () => fixtureHtml } as Response;
    }) as typeof fetch;
    const results = await ddgLiteSearch({
      query: 'x',
      maxResults: 1,
      region: 'us-en',
      safesearch: -2,
      fetchFn,
    });
    expect(results).toHaveLength(1);
    expect(capturedUrl).toContain('kl=us-en');
    expect(capturedUrl).toContain('kp=-2');
  });

  it('throws a friendly error when DDG serves a captcha or anomaly page', async () => {
    const fetchFn = fakeFetch(
      '<html><body>Please complete the following challenge: select all squares containing a duck</body></html>',
    );
    await expect(
      ddgLiteSearch({ query: 'x', fetchFn }),
    ).rejects.toThrow(/blocked the request/);
  });

  it('surfaces HTTP errors', async () => {
    const fetchFn = fakeFetch('', false, 503);
    await expect(ddgLiteSearch({ query: 'x', fetchFn })).rejects.toThrow(/HTTP 503/);
  });

  it('wraps transport failures in a SiloError', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    await expect(ddgLiteSearch({ query: 'x', fetchFn })).rejects.toThrow(SiloError);
  });
});

describe('ddgSearchTool', () => {
  it('is null when disabled', () => {
    expect(ddgSearchTool({ enabled: false })).toBeNull();
  });

  it('is available without any key by default', () => {
    const tool = ddgSearchTool();
    expect(tool).not.toBeNull();
    expect(tool?.namespace).toBe('builtin');
    expect(tool?.name).toBe('web_search');
  });

  it('rejects a missing query argument', async () => {
    const tool = ddgSearchTool();
    await expect(tool?.run({})).rejects.toThrow(/non-empty "query"/);
  });
});

describe('format through search', () => {
  it('produces a readable text block incl. title and url', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      void url;
      return { ok: true, status: 200, text: async () => fixtureHtml } as Response;
    }) as typeof fetch;
    try {
      const tool = ddgSearchTool();
      const out = await (tool as { run: (a: unknown) => Promise<string> }).run({ query: 'x' });
      expect(out).toContain('1. The Complete Works of Hack G U');
      expect(out).toContain('https://www.ebay.com/itm/355998096145');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});