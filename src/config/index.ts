import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'smol-toml';
import { getDefaults } from './defaults.js';
import { validateConfig } from './validate.js';
import { SiloError } from '../error/index.js';
import type { SiloConfig } from './type.js';

export function configPath(): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'silo', 'config.toml');
}

export function dataDir(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
}

export function dbPath(): string {
  return join(dataDir(), 'silo', 'silo.db');
}

export function loadConfig(path?: string): SiloConfig {
  const configFile = path ?? configPath();
  if (!existsSync(configFile)) {
    return createTemplate(configFile);
  }

  const raw = readFileSync(configFile, 'utf8');
  let parsed: Record<string, unknown>;
  try {
    parsed = parse(raw) as unknown as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new SiloError(`Invalid TOML in ${configFile}: ${detail}`);
  }

  const defaults = getDefaults();
  const config: SiloConfig = {
    general: {
      ...defaults.general,
      ...(parsed.general as SiloConfig['general'] | undefined),
    },
    models: {
      ...defaults.models,
      ...((parsed.models as SiloConfig['models'] | undefined) ?? {}),
    },
    mcp: {
      servers: {
        ...((parsed.mcp as SiloConfig['mcp'] | undefined)?.servers ?? {}),
      },
    },
    web_search: {
      ...((parsed.web_search as SiloConfig['web_search'] | undefined) ?? {}),
    },
  };
  validateConfig(config, configFile);
  return config;
}

function createTemplate(path: string): SiloConfig {
  const defaults = getDefaults();
  const toml = toTemplateString(defaults);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, toml, 'utf8');
  return defaults;
}

function toTemplateString(config: SiloConfig): string {
  const lines: string[] = [
    '# Silo configuration.',
    '# API keys are read from environment variables, never stored here.',
    '',
    '[general]',
    `default_model = "${config.general.default_model}"`,
    `theme = "${config.general.theme}"`,
    '',
  ];
  for (const [name, model] of Object.entries(config.models)) {
    lines.push(`[models.${name}]`);
    lines.push(`provider = "${model.provider}"`);
    lines.push(`api_key_env = "${model.api_key_env ?? ''}"`);
    lines.push(`model = "${model.model}"`);
    if (model.temperature !== undefined) lines.push(`temperature = ${model.temperature}`);
    if (model.max_tokens !== undefined) lines.push(`max_tokens = ${model.max_tokens}`);
    lines.push('');
  }

  const mcp = config.mcp?.servers ?? {};
  lines.push('# Model Context Protocol servers (tools the model can use).');
  lines.push('# Each server must print JSON-RPC on stdout. Example:');
  lines.push('#');
  lines.push('# [mcp.servers.filesystem]');
  lines.push('# command = "npx"');
  lines.push('# args = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]');
  lines.push('');
  for (const [name, server] of Object.entries(mcp)) {
    lines.push(`[mcp.servers.${name}]`);
    lines.push(`command = "${server.command}"`);
    if (server.args !== undefined && server.args.length > 0) {
      lines.push(`args = [${server.args.map((a) => `"${a}"`).join(', ')}]`);
    }
    if (server.env !== undefined) {
      for (const [k, v] of Object.entries(server.env)) {
        lines.push(`env.${k} = "${v}"`);
      }
    }
    lines.push('');
  }

  lines.push('# Built-in web search (Tavily). Set api_key_env to a Tavily API key');
  lines.push('# (https://tavily.com) to let the model search the web.');
  lines.push('#');
  lines.push('# [web_search]');
  lines.push('# api_key_env = "TAVILY_API_KEY"');
  lines.push('# max_results = 5');
  lines.push('');
  return lines.join('\n');
}
