import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesystemTool, guardTarget, resolveRoots, toAbsolute, isInside } from '../../../src/tools/fs.js';
import { SiloError } from '../../../src/error/index.js';

function makeEnv() {
  const cwd = mkdtempSync(join(tmpdir(), 'silo-fs-cwd-'));
  const home = mkdtempSync(join(tmpdir(), 'silo-fs-home-'));
  const cleanup = () => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  };
  return { cwd, home, cleanup };
}

describe('path helpers', () => {
  it('expands tilde and relative paths', () => {
    const { cwd, home } = makeEnv();
    expect(toAbsolute('~/Docs', cwd, home)).toBe(join(home, 'Docs'));
    expect(toAbsolute('~', cwd, home)).toBe(home);
    expect(toAbsolute('relative/x', cwd, home)).toBe(join(cwd, 'relative/x'));
    expect(toAbsolute('/abs/path', cwd, home)).toBe('/abs/path');
    expect(() => toAbsolute('~other/x', cwd, home)).toThrow(SiloError);
  });

  it('detects containment', () => {
    expect(isInside('/a', '/a/b/c')).toBe(true);
    expect(isInside('/a', '/a')).toBe(true);
    expect(isInside('/a', '/b')).toBe(false);
    expect(isInside('/a', '/a-b')).toBe(false);
  });

  it('resolves default roots to cwd and home', () => {
    const { cwd, home } = makeEnv();
    const { allowed } = resolveRoots({ config: {}, cwd, home });
    expect(allowed).toEqual([cwd, home]);
  });

  it('uses configured roots when provided', () => {
    const { cwd, home } = makeEnv();
    const { allowed } = resolveRoots({ config: { roots: ['~/only', './src'] }, cwd, home });
    expect(allowed).toEqual([join(home, 'only'), join(cwd, 'src')]);
  });

  it('guard blocks paths outside the roots and protected dirs', () => {
    const { cwd, home } = makeEnv();
    const roots = resolveRoots({ config: {}, cwd, home });
    const outside = mkdtempSync(join(tmpdir(), 'silo-fs-outside-'));
    try {
      expect(() => guardTarget(join(outside, 'x'), roots, cwd, home, 'read')).toThrow(/outside/);
      expect(() => guardTarget('~/.ssh', roots, cwd, home, 'read')).toThrow(/protected/);
      expect(() => guardTarget('~/.gnupg', roots, cwd, home, 'write')).toThrow(/protected/);
      expect(() => guardTarget('project/.git/config', roots, cwd, home, 'write')).toThrow(/\.git/);
      expect(guardTarget(join(cwd, 'ok.txt'), roots, cwd, home, 'read')).toBe(join(cwd, 'ok.txt'));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('builtin filesystem tool', () => {
  it('is null when disabled', () => {
    expect(filesystemTool({ enabled: false })).toBeNull();
  });

  it('is available by default', () => {
    const tool = filesystemTool({ enabled: true });
    expect(tool?.namespace).toBe('builtin');
    expect(tool?.name).toBe('filesystem');
    expect(tool?.description).toContain('Do NOT read an entire project');
  });

  it('requires action and path', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await expect(tool.run({})).rejects.toThrow(/action/);
      await expect(tool.run({ action: 'read' })).rejects.toThrow(/path/);
    } finally {
      cleanup();
    }
  });

  it('rejects an unknown action', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await expect(tool.run({ action: 'blast', path: 'x' })).rejects.toThrow(/Unknown filesystem action/);
    } finally {
      cleanup();
    }
  });

  it('writes, reads, and lists files', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await tool.run({ action: 'write', path: 'docs/notes.md', content: '# Hi\nbody text' });
      expect(readFileSync(join(cwd, 'docs', 'notes.md'), 'utf8')).toBe('# Hi\nbody text');
      expect(await tool.run({ action: 'read', path: 'docs/notes.md' })).toBe('# Hi\nbody text');
      const listing = await tool.run({ action: 'list', path: 'docs' });
      expect(listing).toContain('notes.md');
    } finally {
      cleanup();
    }
  });

  it('moves and renames a file across directories (the demo case)', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await tool.run({ action: 'write', path: 'Hello World.md', content: 'hello' });
      await tool.run({ action: 'mkdir', path: '~/Extras' });
      const out = await tool.run({
        action: 'move',
        path: 'Hello World.md',
        dest: '~/Extras/Hello2.md',
      });
      expect(out).toContain('Moved');
      expect(existsSync(join(cwd, 'Hello World.md'))).toBe(false);
      expect(readFileSync(join(home, 'Extras', 'Hello2.md'), 'utf8')).toBe('hello');
      expect(await tool.run({ action: 'list', path: '~/Extras' })).toBe('Hello2.md (5 B)');
    } finally {
      cleanup();
    }
  });

  it('refuses to move outside roots or onto a directory', async () => {
    const { cwd, home, cleanup } = makeEnv();
    const outside = mkdtempSync(join(tmpdir(), 'silo-fs-outside-'));
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await tool.run({ action: 'write', path: 'a.txt', content: 'x' });
      await expect(
        tool.run({ action: 'move', path: 'a.txt', dest: join(outside, 'a.txt') }),
      ).rejects.toThrow(/outside/);
      mkdirSync(join(cwd, 'dest-dir'));
      await expect(tool.run({ action: 'move', path: 'a.txt', dest: 'dest-dir' })).rejects.toThrow(
        /destination exists and is a directory/i,
      );
    } finally {
      cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('deletes files and empty dirs, but refuses non-empty dirs', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await tool.run({ action: 'write', path: 'garbage.txt', content: 'bye' });
      await tool.run({ action: 'delete', path: 'garbage.txt' });
      expect(existsSync(join(cwd, 'garbage.txt'))).toBe(false);

      await tool.run({ action: 'mkdir', path: 'empty-dir' });
      await tool.run({ action: 'delete', path: 'empty-dir' });
      expect(existsSync(join(cwd, 'empty-dir'))).toBe(false);

      await tool.run({ action: 'write', path: 'full/x.txt', content: 'x' });
      await expect(tool.run({ action: 'delete', path: 'full' })).rejects.toThrow(/not empty/);
      await expect(tool.run({ action: 'delete', path: 'nope' })).rejects.toThrow(/not found/);
    } finally {
      cleanup();
    }
  });

  it('blocks writing into protected paths', async () => {
    const { cwd, home, cleanup } = makeEnv();
    try {
      const tool = filesystemTool({ enabled: true }, { cwd, home })!;
      await expect(tool.run({ action: 'write', path: '~/.ssh/id_rsa', content: 'secret' })).rejects.toThrow(
        /protected/,
      );
    } finally {
      cleanup();
    }
  });
});