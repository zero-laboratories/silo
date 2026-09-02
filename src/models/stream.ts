import type { StreamChunk } from './types.js';
import { ApiError } from '../error/index.js';

export interface SseEvent {
  data: string;
}

export async function* readSse(
  response: Response,
  name: string,
): AsyncGenerator<SseEvent> {
  if (!response.ok || !response.body) {
    const text = await response.text();
    let detail = '';
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      detail = parsed.error?.message ?? '';
    } catch {
      detail = text.slice(0, 200);
    }
    throw new ApiError(response.status, `${name} ${detail}`.trim());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string | null = null;

  function* flush(): Generator<SseEvent> {
    if (data !== null) {
      yield { data };
      data = null;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('data:')) {
          data = (data ? data + '\n' : '') + line.slice(5).trim();
        } else if (line === '') {
          yield* flush();
        }
      }
    }

    // Flush a final event that wasn't terminated by a blank line.
    const last = buffer.trim();
    if (last.startsWith('data:')) {
      data = (data ? data + '\n' : '') + last.slice(5).trim();
    }
    yield* flush();
  } finally {
    reader.releaseLock();
  }
}

export interface StreamOptions<T> {
  // Called for every JSON event. Return a string to emit content.
  onEvent: (parsed: T) => string | undefined;
}

export async function* stream<T>(
  response: Response,
  name: string,
  opts: StreamOptions<T>,
): AsyncGenerator<StreamChunk> {
  for await (const event of readSse(response, name)) {
    if (event.data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(event.data) as T;
      const content = opts.onEvent(parsed);
      if (content !== undefined && content.length > 0) {
        yield { type: 'content', content };
      }
    } catch {
      // Non-JSON events are skipped.
    }
  }
  yield { type: 'done' };
}