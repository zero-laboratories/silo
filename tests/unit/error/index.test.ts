import { describe, expect, it } from 'vitest';
import {
  ApiError,
  SiloError,
  TimeoutError,
  isAbortError,
  toUserError,
} from '../../../src/error/index.js';

describe('toUserError', () => {
  it('maps an invalid-key API error', () => {
    const err = new ApiError(401, 'OpenAI invalid x-api-key');
    expect(toUserError(err)).toMatch(/^E: Invalid API key/);
  });

  it('maps a rate limit error', () => {
    expect(toUserError(new ApiError(429, 'OpenAI overflowed')).toLowerCase()).toMatch(/rate limit/);
  });

  it('maps a model-not-found error', () => {
    expect(toUserError(new ApiError(404, 'model not found'))).toMatch(/model was not found/);
  });

  it('maps a probe aborted request', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(toUserError(err)).toBe('E: Request aborted.');
    expect(isAbortError(err)).toBe(true);
  });

  it('maps a timeout to a friendly message', () => {
    expect(toUserError(new TimeoutError('too slow'))).toMatch(/timed out/);
  });

  it('maps network TypeErrors', () => {
    expect(toUserError(new TypeError('fetch failed'))).toMatch(/Network error/);
  });

  it('keeps SiloError messages with the E: prefix', () => {
    expect(toUserError(new SiloError('bad config'))).toBe('E: bad config');
  });

  it('falls back for unknown payloads', () => {
    expect(toUserError('nonsense')).toBe('E: Something went wrong.');
  });
});