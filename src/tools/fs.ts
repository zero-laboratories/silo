import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SiloError } from '../error/index.js';
import type { BuiltinTool } from './types.js';
import type { FilesystemConfig } from '../config/type.js';
import { configPath, dataDir } from '../config/index.js';

const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_CHARS = 512 * 1024;
const EMBED_LIMIT = 200;

export interface FilesystemToolOptions {
  config: FilesystemConfig;
  cwd?: string;
  home?: string;
}

type FsAction = 'read' | 'list' | 'write' | 'move' | 'mkdir' | 'delete';

export interface ResolvedRoots {
  allowed: string[];
  protected: string[];
}

export function resolveRoots(opts: FilesystemToolOptions): ResolvedRoots {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const home = opts.home ?? homedir();
  const allowed = opts.config.roots && opts.config.roots.length > 0
    ? opts.config.roots.map((r) => toAbsolute(r, cwd, home))
    : [cwd, home];
  const protectedPaths = [
    dirname(configPath()),
    dataDir(),
    join(home, '.ssh'),
    join(home, '.gnupg'),
    join(home, '.config', 'silo'),
  ];
  return { allowed: [...new Set(allowed)], protected: [...new Set(protectedPaths)] };
}

export function toAbsolute(raw: string, cwd: string, home: string): string {
  if (raw === '~') return home;
  if (raw.startsWith('~/')) return join(home, raw.slice(2));
  if (raw.startsWith('~')) {
    throw new SiloError(`Unsupported home-relative path "${raw}". Use "~/..." to refer to your home directory.`);
  }
  return resolve(cwd, raw);
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function withinAny(roots: string[], target: string): boolean {
  return roots.some((r) => isInside(r, target));
}

export function hasDotGitSegment(target: string): boolean {
  return target.split(/[\\/]/).some((seg) => seg === '.git');
}

export function guardTarget(
  raw: string,
  roots: ResolvedRoots,
  cwd: string,
  home: string,
  op: FsAction,
): string {
  const target = toAbsolute(raw, cwd, home);
  if (!withinAny(roots.allowed, target)) {
    throw new SiloError(
      `Cannot ${op} "${display(raw)}": outside the allowed filesystem roots.`,
    );
  }
  if (roots.protected.some((r) => isInside(r, target) || isInside(target, r))) {
    throw new SiloError(`Cannot ${op} "${display(raw)}": protected path.`);
  }
  if (hasDotGitSegment(target)) {
    throw new SiloError(`Cannot ${op} "${display(raw)}": path inside a .git directory.`);
  }
  return target;
}

function display(raw: string): string {
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function opRead(target: string): string {
  let stat;
  try {
    stat = statSync(target);
  } catch (err) {
    throw new SiloError(`Cannot read: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (stat.isDirectory()) {
    throw new SiloError(`"${target}" is a directory. Use the "list" action instead.`);
  }
  if (stat.size > MAX_READ_BYTES) {
    return `File is ${formatSize(stat.size)} (> ${formatSize(MAX_READ_BYTES)}). Showing first ${EMBED_LIMIT} lines:\n${readFileSync(target, 'utf8').split('\n').slice(0, EMBED_LIMIT).join('\n')}`;
  }
  return readFileSync(target, 'utf8');
}

function opList(target: string): string {
  if (!existsSync(target)) throw new SiloError(`Directory not found: "${target}".`);
  const entries = readdirSync(target, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (entries.length === 0) return '(empty directory)';
  const lines = entries.map((e) => {
    const p = join(target, e.name);
    let suffix = '';
    let extra = '';
    try {
      const stat = statSync(p);
      suffix = e.isDirectory() ? '/' : '';
      extra = e.isDirectory() ? '' : ` (${formatSize(stat.size)})`;
    } catch {
      suffix = '';
    }
    return `${e.name}${suffix}${extra}`;
  });
  return lines.join('\n');
}

function opWrite(raw: string, content: unknown, roots: ResolvedRoots, cwd: string, home: string): string {
  const target = guardTarget(raw, roots, cwd, home, 'write');
  if (typeof content !== 'string') {
    throw new SiloError('The "write" action requires a "content" string.');
  }
  if (content.length > MAX_WRITE_CHARS) {
    throw new SiloError(`Content is too large (${content.length} chars, max ${MAX_WRITE_CHARS}).`);
  }
  if (existsSync(target) && lstatSync(target).isDirectory()) {
    throw new SiloError(`"${raw}" is a directory; provide a file path.`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return `Wrote ${content.length} chars to ${target}`;
}

function opMove(
  rawSrc: string,
  rawDst: string,
  roots: ResolvedRoots,
  cwd: string,
  home: string,
): string {
  const src = guardTarget(rawSrc, roots, cwd, home, 'move');
  const dst = toAbsolute(rawDst, cwd, home);
  guardTarget(rawDst, roots, cwd, home, 'move');
  if (!existsSync(src)) throw new SiloError(`Source not found: "${rawSrc}".`);
  if (existsSync(dst) && lstatSync(dst).isDirectory()) {
    throw new SiloError(`Destination exists and is a directory: "${rawDst}".`);
  }
  if (isInside(src, dst)) {
    throw new SiloError('Cannot move a path into itself.');
  }
  mkdirSync(dirname(dst), { recursive: true });
  renameSync(src, dst);
  return `Moved "${rawSrc}" to "${rawDst}"`;
}

function opMkdir(raw: string, roots: ResolvedRoots, cwd: string, home: string): string {
  const target = guardTarget(raw, roots, cwd, home, 'mkdir');
  mkdirSync(target, { recursive: true });
  return `Created directory ${target}`;
}

function opDelete(raw: string, roots: ResolvedRoots, cwd: string, home: string): string {
  const target = guardTarget(raw, roots, cwd, home, 'delete');
  if (!existsSync(target)) throw new SiloError(`Path not found: "${raw}".`);
  const stat = lstatSync(target);
  if (stat.isDirectory()) {
    const remaining = readdirSync(target);
    if (remaining.length > 0) {
      throw new SiloError(`Directory "${raw}" is not empty (${remaining.length} entries). Refusing to delete recursively.`);
    }
    rmdirSync(target);
    return `Deleted empty directory "${raw}"`;
  }
  unlinkSync(target);
  return `Deleted "${raw}"`;
}

export function filesystemTool(config: FilesystemConfig, opts: { cwd?: string; home?: string } = {}): BuiltinTool | null {
  if (config.enabled === false) return null;
  const cwd = resolve(opts.cwd ?? process.cwd());
  const home = opts.home ?? homedir();
  const roots = resolveRoots({ config, cwd, home });

  return {
    namespace: 'builtin',
    name: 'filesystem',
    description:
      'Read, list, write, move (rename), create directories, and delete files within the allowed ' +
      'filesystem roots (the current working directory and your home directory by default). Move ' +
      'handles both moving between directories and renaming. Paths may be relative to the current ' +
      'directory or start with ~/ for home. Protected paths (.ssh, .gnupg, silo config/data, .git) ' +
      'are always off-limits.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'list', 'write', 'move', 'mkdir', 'delete'],
          description: 'Operation to perform',
        },
        path: {
          type: 'string',
          description: "Target file or directory (relative to cwd, or ~/... for home)",
        },
        dest: {
          type: 'string',
          description: 'Destination for "move" (rename/move target)',
        },
        content: {
          type: 'string',
          description: 'Text content for "write"',
        },
      },
      required: ['action', 'path'],
    },
    run: async (args: unknown) => {
      const { action, path, dest, content } = (args ?? {}) as {
        action?: unknown;
        path?: unknown;
        dest?: unknown;
        content?: unknown;
      };
      if (typeof action !== 'string') {
        throw new SiloError('The filesystem tool requires an "action" argument.');
      }
      if (typeof path !== 'string' || path.trim().length === 0) {
        throw new SiloError('The filesystem tool requires a non-empty "path" argument.');
      }
      switch (action as FsAction) {
        case 'read':
          return opRead(guardTarget(path, roots, cwd, home, 'read'));
        case 'list':
          return opList(guardTarget(path, roots, cwd, home, 'list'));
        case 'write':
          return opWrite(path, content, roots, cwd, home);
        case 'move': {
          if (typeof dest !== 'string' || dest.trim().length === 0) {
            throw new SiloError('The "move" action requires a "dest" argument.');
          }
          return opMove(path, dest, roots, cwd, home);
        }
        case 'mkdir':
          return opMkdir(path, roots, cwd, home);
        case 'delete':
          return opDelete(path, roots, cwd, home);
        default:
          throw new SiloError(
            `Unknown filesystem action "${String(action)}". Expected one of: read, list, write, move, mkdir, delete.`,
          );
      }
    },
  };
}