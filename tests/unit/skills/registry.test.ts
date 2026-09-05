import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../../../src/skills/registry.js';
import { loadSkills } from '../../../src/skills/loader.js';
import { SiloError } from '../../../src/error/index.js';

function regContent(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

describe('SkillRegistry', () => {
  const registry = () =>
    new SkillRegistry([
      {
        name: 'update-changelog',
        description: 'Keeps the changelog in sync with commits',
        content: regContent('update-changelog', 'Keeps the changelog in sync with commits', 'Compare titles and group by type.'),
        path: '/x/skills/update-changelog/SKILL.md',
        dir: '/x/skills/update-changelog',
      },
      {
        name: 'web-search',
        description: 'Find answers from the web',
        content: regContent('web-search', 'Find answers from the web', 'Use the web when knowledge is stale.'),
        path: '/x/skills/web-search/SKILL.md',
        dir: '/x/skills/web-search',
      },
    ]);

  it('lists skills in insertion order', () => {
    const names = registry().listSkills().map((s) => s.name);
    expect(names).toEqual(['update-changelog', 'web-search']);
  });

  it('exposes the list_skills tool', async () => {
    const tools = registry().listTools();
    const list = tools.find((t) => t.name === 'list_skills')!;
    expect(list.namespace).toBe('builtin');
    expect(await list.run({})).toContain(
      '- update-changelog: Keeps the changelog in sync with commits',
    );
    expect(list.inputSchema).toBeTruthy();
  });

  it('says when no skills are available', async () => {
    const list = new SkillRegistry([]).listTools().find((t) => t.name === 'list_skills')!;
    expect(await list.run({})).toBe('No skills are available in this environment.');
  });

  it('loads a skill with its full instructions', async () => {
    const tool = registry().listTools().find((t) => t.name === 'skill')!;
    const out = await tool.run({ name: 'update-changelog' });
    expect(out).toContain('# Skill: update-changelog');
    expect(out).toContain('Compare titles and group by type.');
  });

  it('appends invoked arguments when given', async () => {
    const tool = registry().listTools().find((t) => t.name === 'skill')!;
    const out = await tool.run({ name: 'web-search', arguments: '{"topic":"rust"}' });
    expect(out).toContain('Invoked with arguments:');
    expect(out).toContain('{"topic":"rust"}');
  });

  it('rejects an unknown skill with a friendly error', async () => {
    const tool = registry().listTools().find((t) => t.name === 'skill')!;
    await expect(tool.run({ name: 'nope' })).rejects.toThrow(
      /Unknown skill "nope". Available skills: update-changelog, web-search/,
    );
  });

  it('rejects a missing name argument', async () => {
    const tool = registry().listTools().find((t) => t.name === 'skill')!;
    await expect(tool.run({})).rejects.toThrow(SiloError);
  });
});

describe('SkillRegistry against a real skills tree', () => {
  it('runs the full load -> list -> read path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'silo-skills-'));
    const home = mkdtempSync(join(tmpdir(), 'silo-home-'));
    try {
      const dir = join(root, '.claude', 'skills', 'triage');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'SKILL.md'),
        regContent('triage', 'Prioritizes incoming issues', 'Sort by severity.'),
        'utf8',
      );
      const skills = loadSkills({ cwd: root, home });
      const registry = new SkillRegistry(skills);
      const tool = registry.listTools().find((t) => t.name === 'skill')!;
      const out = await tool.run({ name: 'triage', arguments: '{"severity":"high"}' });
      expect(out).toContain('# Skill: triage');
      expect(out).toContain('Sort by severity.');
      expect(out).toContain('{"severity":"high"}');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});