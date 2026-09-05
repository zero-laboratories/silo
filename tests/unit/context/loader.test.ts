import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONTEXT_INSTRUCTION,
  findContextFiles,
  formatContextFiles,
  loadContextFiles,
} from '../../../src/context/loader.js';

describe('findContextFiles', () => {
  it('finds AGENTS.md and CLAUDE.md walking up, nearest first', () => {
    const root = mkdtempSync(join(tmpdir(), 'silo-ctx-'));
    try {
      const nested = join(root, 'pkg', 'src');
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(root, 'AGENTS.md'), 'root agents', 'utf8');
      writeFileSync(join(root, 'CLAUDE.md'), 'root claude', 'utf8');
      writeFileSync(join(nested, 'AGENTS.md'), 'nested agents', 'utf8');
      writeFileSync(join(root, 'pkg', 'CLAUDE.md'), 'pkg claude', 'utf8');

      const found = findContextFiles(nested);
      expect(found).toEqual([
        { name: 'AGENTS.md', path: join(nested, 'AGENTS.md') },
        { name: 'CLAUDE.md', path: join(root, 'pkg', 'CLAUDE.md') },
        { name: 'AGENTS.md', path: join(root, 'AGENTS.md') },
        { name: 'CLAUDE.md', path: join(root, 'CLAUDE.md') },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns nothing when no context files exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'silo-ctx-'));
    try {
      expect(findContextFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('formatContextFiles', () => {
  it('produces an instruction plus labelled file blocks', () => {
    const files = loadContextFiles();
    void files;
    const out = formatContextFiles([
      { name: 'AGENTS.md', path: '/proj/AGENTS.md', content: '  Build with pnpm.  ' },
      { name: 'CLAUDE.md', path: '/proj/CLAUDE.md', content: 'Typecheck before commit.' },
    ]);
    expect(out).toContain(CONTEXT_INSTRUCTION);
    expect(out).toContain('## AGENTS.md (/proj/AGENTS.md)');
    expect(out).toContain('Build with pnpm.');
    expect(out).toContain('## CLAUDE.md (/proj/CLAUDE.md)');
    expect(out).toContain('Typecheck before commit.');
  });

  it('returns an empty string when there are no files', () => {
    expect(formatContextFiles([])).toBe('');
  });
});