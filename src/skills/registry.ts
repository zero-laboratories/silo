import { SiloError } from '../error/index.js';
import type { BuiltinTool } from '../tools/types.js';
import { parseSkillFrontmatter } from './loader.js';
import type { Skill } from './types.js';

const NAMESPACE = 'builtin';

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  constructor(skills: Skill[]) {
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  listSkills(): Skill[] {
    return [...this.skills.values()];
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  listTools(): BuiltinTool[] {
    return [this.listTool(), this.readTool()];
  }

  private listTool(): BuiltinTool {
    return {
      namespace: NAMESPACE,
      name: 'list_skills',
      description:
        'List the skills available in this environment. Each skill has a name and a description. ' +
        'When the user request matches a skill description, load that skill with the skill tool to ' +
        'obtain its full instructions and follow them.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      run: async () => {
        const skills = this.listSkills();
        if (skills.length === 0) {
          return 'No skills are available in this environment.';
        }
        return skills.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n');
      },
    };
  }

  private readTool(): BuiltinTool {
    return {
      namespace: NAMESPACE,
      name: 'skill',
      description:
        'Load a skill\'s full markdown instructions into context. Call this when the user\'s request ' +
        'matches one of the skills listed by list_skills: pass the skill\'s exact name plus an optional ' +
        'JSON object of arguments if the skill needs any. The skill instructions are returned and you ' +
        'should follow them for the task.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The exact name of the skill to load' },
          arguments: {
            type: 'string',
            description: 'Optional JSON object of arguments to pass to the skill',
          },
        },
        required: ['name'],
      },
      run: async (args: unknown) => {
        const { name, arguments: rawArgs } = (args ?? {}) as {
          name?: unknown;
          arguments?: unknown;
        };
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new SiloError('The skill tool requires a non-empty "name" argument.');
        }
        const skill = this.skills.get(name.trim());
        if (!skill) {
          const names = this.listSkills().map((s) => s.name);
          throw new SiloError(
            `Unknown skill "${name.trim()}". Available skills: ${names.length ? names.join(', ') : 'none'}.`,
          );
        }
        const { frontmatter, body } = parseSkillFrontmatter(skill.content);
        let out = `# Skill: ${skill.name}${frontmatter.description ? `\n\n${frontmatter.description}` : ''}` +
          (body ? `\n\n${body}` : '');
        if (typeof rawArgs === 'string' && rawArgs.trim()) {
          out += `\n\nInvoked with arguments:\n${rawArgs}\n`;
        }
        return out.trim();
      },
    };
  }
}