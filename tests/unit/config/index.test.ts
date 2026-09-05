import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('parses MCP server definitions', () => {
    withConfig(
      `[general]\ndefault_model = "openai"\n\n[mcp.servers.filesystem]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\nenv.FOO = "bar"\n`,
      (path) => {
        const cfg = loadConfig(path);
        expect(cfg.mcp?.servers?.filesystem).toEqual({
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: { FOO: 'bar' },
        });
      },
    );
  });

  it('defaults MCP servers to an empty set', () => {
    withConfig('[general]\ndefault_model = "openai"\n', (path) => {
      const cfg = loadConfig(path);
      expect(cfg.mcp?.servers).toEqual({});
    });
  });

  it('emits an MCP example and servers in the template', () => {
    const dir = mkdtempSync(join(tmpdir(), 'silo-cfg-'));
    const path = join(dir, 'new.toml');
    try {
      loadConfig(path);
      const raw = readFileSync(path, 'utf8');
      expect(raw).toContain('[mcp.servers.');
      expect(raw).toContain('@modelcontextprotocol/server-filesystem');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses the web_search section', () => {
    withConfig(
      '[general]\ndefault_model = "openai"\n\n[web_search]\nenabled = true\nmax_results = 3\nregion = "us-en"\nsafesearch = -2\n',
      (path) => {
        const cfg = loadConfig(path);
        expect(cfg.web_search).toEqual({
          enabled: true,
          max_results: 3,
          region: 'us-en',
          safesearch: -2,
        });
      },
    );
  });

  it('defaults web_search to nothing configured', () => {
    withConfig('[general]\ndefault_model = "openai"\n', (path) => {
      const cfg = loadConfig(path);
      expect(cfg.web_search).toEqual({});
    });
  });

  it('documents web_search in the template', () => {
    const dir = mkdtempSync(join(tmpdir(), 'silo-cfg-'));
    const path = join(dir, 'new.toml');
    try {
      loadConfig(path);
      const raw = readFileSync(path, 'utf8');
      expect(raw).toContain('[web_search]');
      expect(raw).toContain('region = "wt-wt"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
