import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Skill } from './types.js';

export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

export interface LoadSkillsOptions {
  cwd?: string;
  home?: string;
}

const PROJECT_AGENT_DIRS = ['.silo', '.agents', '.opencode', '.claude'];

const USER_AGENT_DIRS = [
  ['.config', 'silo'],
  ['.config', 'opencode'],
  ['.claude'],
  ['.agents'],
];

export function parseSkillFrontmatter(markdown: string): ParsedSkill {
  const frontmatter = parseRawFrontmatter(markdown);
  return {
    frontmatter: { name: '', description: '', ...frontmatter },
    body: stripFrontmatter(markdown).trim(),
  };
}

function parseRawFrontmatter(markdown: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

export function skillSearchDirs(cwd: string = process.cwd(), home?: string): string[] {
  const dirs: string[] = [];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    for (const sub of PROJECT_AGENT_DIRS) {
      dirs.push(join(dir, sub, 'skills'));
    }
    if (dirname(dir) === dir) break;
  }
  const h = home ?? homedir();
  for (const parts of USER_AGENT_DIRS) {
    dirs.push(join(h, ...parts, 'skills'));
  }
  return [...new Set(dirs)];
}

export function loadSkills(opts: LoadSkillsOptions = {}): Skill[] {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const home = opts.home;
  const skills = new Map<string, Skill>();
  for (const skillDir of skillSearchDirs(cwd, home)) {
    if (!existsSync(skillDir)) continue;
    for (const entry of readdirSync(skillDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(skillDir, entry.name, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, 'utf8');
      const { frontmatter } = parseSkillFrontmatter(content);
      const name = frontmatter.name || entry.name;
      if (name.length === 0 || skills.has(name)) continue;
      skills.set(name, {
        name,
        description: frontmatter.description,
        content,
        path: skillPath,
        dir: join(skillDir, entry.name),
      });
    }
  }
  return [...skills.values()];
}