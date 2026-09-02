import { describe, expect, it } from 'vitest';
import { readSse, stream } from '../../../src/models/stream.js';
import { ApiError } from '../../../src/error/index.js';

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

async function collectSse(chunks: string[], status = 200): Promise<string[]> {
  const events: string[] = [];
  for await (const e of readSse(sseResponse(chunks, status), 'TestProvider')) {
    events.push(e.data);
  }
  return events;
}

describe('readSse', () => {
  it('throws ApiError with parsed error.message on non-OK responses', async () => {
    const resp = sseResponse(['{"error":{"message":"bad key"}}'], 401);
    await expect(async () => {
      for await (const _ of readSse(resp, 'TestProvider')) {
        // noop
      }
    }).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'TestProvider bad key',
    });
  });

  it('throws ApiError with raw snippet on a non-JSON error body', async () => {
    const resp = sseResponse(['plain failure text'], 500);
    await expect(async () => {
      for await (const _ of readSse(resp, 'TestProvider')) {
        // noop
      }
    }).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'TestProvider plain failure text',
    });
  });

  it('parses a single event terminated by a blank line', async () => {
    expect(await collectSse(['data: hello\n', '', '\n'])).toEqual(['hello']);
  });

  it('parses multiple events in one chunk', async () => {
    expect(await collectSse(['data: a\n\ndata: b\n\n'])).toEqual(['a', 'b']);
  });

  it('joins multi-line data with a newline', async () => {
    expect(await collectSse(['data: line1\n', 'data: line2\n\n'])).toEqual(['line1\nline2']);
  });

  it('parses an event split across stream chunks', async () => {
    expect(await collectSse(['data: Hel', 'lo\n\n'])).toEqual(['Hello']);
  });

  it('handles an incomplete final line without a trailing blank line', async () => {
    expect(await collectSse(['data: tail'])).toEqual(['tail']);
  });

  it('yields a [DONE] event as-is', async () => {
    expect(await collectSse(['data: [DONE]\n\n'])).toEqual(['[DONE]']);
  });

  it('trims surrounding whitespace from data payloads', async () => {
    expect(await collectSse(['data:   padded   \n\n'])).toEqual(['padded']);
  });
});

describe('stream', () => {
  function jsonChunk(payload: string): Response {
    return sseResponse([`data: ${payload}\n\n`]);
  }

  it('yields content chunks from onEvent and a final done event', async () => {
    const events: string[] = [];
    for await (const c of stream<{ text?: string }>(jsonChunk('{"text":"zzz"}'), 'Test', {
      onEvent: (p) => (p.text ? `${p.text}!` : undefined),
    })) {
      events.push(c.type === 'content' ? `content:${c.content ?? ''}` : c.type);
    }
    expect(events).toEqual(['content:zzz!', 'done']);
  });

  it('skips [DONE] and non-JSON events', async () => {
    const resp = sseResponse(['data: [DONE]\n\n', 'data: not-json\n\n', 'data: {"text":"ok"}\n\n']);
    const events: string[] = [];
    for await (const c of stream<{ text?: string }>(resp, 'Test', {
      onEvent: (p) => p.text,
    })) {
      events.push(c.type === 'content' ? c.content ?? '' : c.type);
    }
    expect(events).toEqual(['ok', 'done']);
  });

  it('does not yield empty content strings', async () => {
    const events: string[] = [];
    for await (const c of stream<{ text?: string }>(jsonChunk('{"text":""}'), 'Test', {
      onEvent: () => '',
    })) {
      events.push(c.type);
    }
    expect(events).toEqual(['done']);
  });
});