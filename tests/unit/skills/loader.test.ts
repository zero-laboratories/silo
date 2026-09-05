import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkills, parseSkillFrontmatter, skillSearchDirs } from '../../../src/skills/loader.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'silo-skills-'));
}

function writeSkill(root: string, relDir: string, body: string) {
  const dir = join(root, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), body, 'utf8');
}

describe('parseSkillFrontmatter', () => {
  it('extracts name and description from YAML frontmatter', () => {
    const md = `---
name: shell-commands
description: Runs shell commands on the user's machine
---
Run commands for the user.
`;
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter.name).toBe('shell-commands');
    expect(frontmatter.description).toBe("Runs shell commands on the user's machine");
    expect(body).toBe('Run commands for the user.');
  });

  it('ignores quoted values', () => {
    const md = '---\nname: "quoted-name"\ndescription: \'quoted desc\'\n---\nbody';
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter.name).toBe('quoted-name');
    expect(frontmatter.description).toBe('quoted desc');
  });

  it('treats a file without frontmatter as a plain body', () => {
    const { frontmatter, body } = parseSkillFrontmatter('just instructions');
    expect(frontmatter.name).toBe('');
    expect(frontmatter.description).toBe('');
    expect(body).toBe('just instructions');
  });
});

describe('skillSearchDirs', () => {
  it('walks up the project tree and includes user-level dirs last', () => {
    const dirs = skillSearchDirs('/a/b/c', '/home/user');
    expect(dirs[0]).toBe(join('/a/b/c/.silo', 'skills'));
    expect(dirs).toContain(join('/a/b/.opencode', 'skills'));
    expect(dirs).toContain(join('/.claude', 'skills'));
    expect(dirs[dirs.length - 1]).toBe(join('/home/user/.agents', 'skills'));
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('defaults cwd to the current directory', () => {
    expect(skillSearchDirs()).toContain(join(process.cwd(), '.silo', 'skills'));
  });
});

describe('loadSkills', () => {
  it('loads skills from project and user directories, nearest wins', () => {
    const root = tempDir();
    const home = mkdtempSync(join(tmpdir(), 'silo-home-'));
    try {
      writeSkill(
        root,
        join('.silo', 'skills', 'search'),
        '---\nname: search\ndescription: Local search helper for the project\n---\nProject skill body.',
      );
      writeSkill(
        home,
        join('.config', 'silo', 'skills', 'search'),
        '---\nname: search\ndescription: Global search helper\n---\nGlobal skill body.',
      );
      writeSkill(home, join('.claude', 'skills', 'add-todo'), '---\nname: add-todo\n---\nTodo skill.');

      const skills = loadSkills({ cwd: root, home });
      expect(skills).toHaveLength(2);
      const search = skills.find((s) => s.name === 'search')!;
      expect(search.description).toBe('Local search helper for the project');
      expect(search.content).toContain('Project skill body.');
      expect(search.dir).toBe(join(root, '.silo', 'skills', 'search'));
      expect(skills.find((s) => s.name === 'add-todo')).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('falls back to the directory name when frontmatter has no name', () => {
    const root = tempDir();
    const home = mkdtempSync(join(tmpdir(), 'silo-home-'));
    try {
      writeSkill(root, join('.agents', 'skills', 'my-skill'), 'no frontmatter here');
      const skills = loadSkills({ cwd: root, home });
      expect(skills[0].name).toBe('my-skill');
      expect(skills[0].description).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns an empty list when nothing is found', () => {
    const root = tempDir();
    const home = mkdtempSync(join(tmpdir(), 'silo-home-'));
    try {
      expect(loadSkills({ cwd: root, home })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});