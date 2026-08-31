import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../../src/config/index.js';

function withConfig(toml: string, fn: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'silo-cfg-'));
  const path = join(dir, 'config.toml');
  writeFileSync(path, toml, 'utf8');
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadConfig', () => {
  it('fills defaults for missing fields', () => {
    withConfig('[general]\ndefault_model = "openai"\n', (path) => {
      const cfg = loadConfig(path);
      expect(cfg.general.default_model).toBe('openai');
      expect(cfg.general.theme).toBe('dark');
      expect(cfg.models.openai).toBeTruthy();
    });
  });

  it('merges custom model settings over defaults', () => {
    withConfig(
      `[models.claude]\nprovider = "anthropic"\nmodel = "claude-3-opus"\ntemperature = 0.1\n`,
      (path) => {
        const cfg = loadConfig(path);
        expect(cfg.models.claude.model).toBe('claude-3-opus');
        expect(cfg.models.claude.temperature).toBe(0.1);
      },
    );
  });

  it('creates a template when the config does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'silo-cfg-'));
    const path = join(dir, 'new.toml');
    try {
      const cfg = loadConfig(path);
      expect(cfg.general.default_model).toBe('claude');
      expect(Object.keys(cfg.models).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
