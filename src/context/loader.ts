import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ContextFileName = 'AGENTS.md' | 'CLAUDE.md';

export interface ContextFile {
  name: ContextFileName;
  path: string;
  content: string;
}

export interface LoadContextOptions {
  cwd?: string;
}

export const CONTEXT_INSTRUCTION =
  "The following project context files (AGENTS.md/CLAUDE.md) contain instructions the assistant " +
  "must follow while working in this repository. They take priority over general behavior. If they " +
  "conflict with the user's direct request, follow the user. Nearest files are listed first and have " +
  'the highest priority.';

export function findContextFiles(cwd: string = process.cwd()): Array<{ name: ContextFileName; path: string }> {
  const found: Array<{ name: ContextFileName; path: string }> = [];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    for (const name of ['AGENTS.md', 'CLAUDE.md'] as const) {
      const p = join(dir, name);
      if (existsSync(p)) found.push({ name, path: p });
    }
    if (dirname(dir) === dir) break;
  }
  return found;
}

export function loadContextFiles(opts: LoadContextOptions = {}): ContextFile[] {
  return findContextFiles(opts.cwd).map(({ name, path }) => ({
    name,
    path,
    content: readFileSync(path, 'utf8'),
  }));
}

export function formatContextFiles(files: ContextFile[]): string {
  if (files.length === 0) return '';
  const blocks = files.map((f) => `## ${f.name} (${f.path})\n\n${f.content.trim()}`);
  return `${CONTEXT_INSTRUCTION}\n\n${blocks.join('\n\n')}`;
}