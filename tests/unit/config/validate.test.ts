import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../../src/config/index.js';
import { SiloError } from '../../../src/error/index.js';

function withConfig(toml: string, fn: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'silo-val-'));
  const path = join(dir, 'config.toml');
  writeFileSync(path, toml, 'utf8');
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectError(toml: string, pattern: RegExp) {
  withConfig(toml, (path) => {
    expect(() => loadConfig(path)).toThrow(SiloError);
    try {
      loadConfig(path);
    } catch (err) {
      expect(err).toBeInstanceOf(SiloError);
      expect((err as SiloError).message).toMatch(pattern);
    }
  });
}

describe('config validation', () => {
  it('accepts a valid config', () => {
    withConfig(
      `[general]
default_model = "claude"
[models.claude]
provider = "anthropic"
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-3-5-sonnet-latest"
temperature = 0.7
max_tokens = 2000
timeout = 60
`,
      (path) => {
        expect(loadConfig(path).general.default_model).toBe('claude');
      },
    );
  });

  it('rejects a default_model that has no matching model', () => {
    expectError(
      '[general]\ndefault_model = "nope"\n',
      /default_model "nope" does not match/,
    );
  });

  it('rejects an unknown provider', () => {
    expectError(
      '[models.a]\nprovider = "ollama"\nmodel = "x"\n',
      /unknown provider "ollama"/,
    );
  });

  it('rejects a missing model string', () => {
    expectError(
      '[models.a]\nprovider = "openai"\n',
      /models\.a: missing "model"/,
    );
  });

  it('rejects an out-of-range temperature', () => {
    expectError(
      '[models.a]\nprovider = "openai"\nmodel = "gpt-4o"\ntemperature = 4\n',
      /temperature" must be between 0 and 2/,
    );
  });

  it('rejects a non-positive max_tokens', () => {
    expectError(
      '[models.a]\nprovider = "openai"\nmodel = "gpt-4o"\nmax_tokens = -1\n',
      /max_tokens" must be a positive integer/,
    );
  });

  it('rejects a non-positive timeout', () => {
    expectError(
      '[models.a]\nprovider = "openai"\nmodel = "gpt-4o"\ntimeout = 0\n',
      /timeout" must be a positive number/,
    );
  });

  it('rejects malformed TOML', () => {
    expectError(
      '[models.a\nprovider = broken',
      /Invalid TOML/,
    );
  });
});