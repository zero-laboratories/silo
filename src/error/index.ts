export class SiloError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiloError';
  }
}

export class ApiError extends SiloError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class TimeoutError extends SiloError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function statusMessage(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return 'Invalid API key or insufficient permissions. Check the key referenced in your config.';
    case 429:
      return 'Rate limit exceeded or the model is overloaded. Try again in a moment.';
    case 404:
      return 'The model was not found. Check the model name in your config.';
    case 413:
      return 'The request is too large for this model. Try a shorter message.';
    case 400:
      return 'The provider rejected the request. Check your model config.';
    default:
      return `The provider returned an error (HTTP ${status}).`;
  }
}

export function toUserError(err: unknown): string {
  if (err instanceof ApiError) {
    const base = statusMessage(err.status);
    return err.message ? `E: ${base} ${err.message}` : `E: ${base}`;
  }
  if (err instanceof TimeoutError) {
    return 'E: Request timed out. The provider did not respond in time.';
  }
  if (err instanceof SiloError) {
    return `E: ${err.message}`;
  }
  if (err instanceof Error) {
    if (isAbortError(err)) {
      return 'E: Request aborted.';
    }
    if (err.name === 'TimeoutError') {
      return 'E: Request timed out. The provider did not respond in time.';
    }
    if (err.name === 'TypeError') {
      return 'E: Network error. Could not reach the provider. Check your connection.';
    }
    return `E: ${err.message}`;
  }
  return 'E: Something went wrong.';
}

export { isAbortError };