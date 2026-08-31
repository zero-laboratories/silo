export class SiloError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiloError';
  }
}

export function toUserError(err: unknown): string {
  if (err instanceof SiloError) {
    return `E: ${err.message}`;
  }
  if (err instanceof Error) {
    return `E: ${err.message}`;
  }
  return 'E: Something went wrong.';
}
