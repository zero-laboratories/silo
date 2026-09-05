import type { McpServerConfig } from '../config/type.js';
import type { ToolDefinition } from '../models/types.js';
import type { BuiltinTool } from '../tools/types.js';
import { SiloError } from '../error/index.js';
import { McpClient } from './client.js';

const NAMESPACE_SEPARATOR = '__';

export class McpRegistry {
  private readonly clients = new Map<string, McpClient>();
  private readonly builtins = new Map<string, BuiltinTool>();
  private toolsCache: ToolDefinition[] | null = null;

  constructor(
    private readonly servers: Record<string, McpServerConfig>,
    builtins: BuiltinTool[] = [],
  ) {
    for (const tool of builtins) {
      this.builtins.set(`${tool.namespace}${NAMESPACE_SEPARATOR}${tool.name}`, tool);
    }
  }

  serverNames(): string[] {
    return Object.keys(this.servers);
  }

  async listTools(): Promise<ToolDefinition[]> {
    if (this.toolsCache !== null) return this.toolsCache;
    const tools: ToolDefinition[] = [];
    for (const tool of this.builtins.values()) {
      tools.push({
        name: `${tool.namespace}${NAMESPACE_SEPARATOR}${tool.name}`,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
    for (const name of this.serverNames()) {
      const client = await this.clientFor(name);
      if (!client) continue;
      let listed: ToolDefinition[];
      try {
        listed = (await client.listTools()).map((t) => ({
          name: `${name}${NAMESPACE_SEPARATOR}${t.name}`,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      } catch (err) {
        throw new SiloError(
          `MCP server "${name}" did not list tools: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      tools.push(...listed);
    }
    this.toolsCache = tools;
    return tools;
  }

  async callTool(name: string, args: unknown): Promise<string> {
    const sep = name.indexOf(NAMESPACE_SEPARATOR);
    if (sep <= 0) {
      throw new SiloError(`Unknown MCP tool "${name}".`);
    }
    const serverName = name.slice(0, sep);
    const toolName = name.slice(sep + NAMESPACE_SEPARATOR.length);

    const builtin = this.builtins.get(name);
    if (builtin) {
      return builtin.run(args);
    }
    if (!this.servers[serverName]) {
      throw new SiloError(`Unknown MCP tool "${name}".`);
    }
    if (this.servers[serverName].enabled === false) {
      throw new SiloError(`MCP server "${serverName}" is disabled.`);
    }
    const client = await this.clientFor(serverName);
    if (!client) throw new SiloError(`MCP server "${serverName}" is disabled or missing.`);
    const result = await client.callTool(toolName, args);
    const texts = result.content.filter((c) => c.type === 'text' && c.text !== undefined).map((c) => c.text ?? '');
    if (texts.length > 0) {
      const joined = texts.join('\n');
      return result.isError ? `Error: ${joined}` : joined;
    }
    return result.isError
      ? 'Error: tool returned an empty result.'
      : 'Tool produced no text output.';
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.toolsCache = null;
  }

  private async clientFor(name: string): Promise<McpClient | null> {
    const config = this.servers[name];
    if (!config || config.enabled === false) return null;
    const existing = this.clients.get(name);
    if (existing) return existing;
    const client = new McpClient(name, config);
    try {
      await client.connect();
    } catch (err) {
      throw new SiloError(
        `MCP server "${name}" failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.clients.set(name, client);
    return client;
  }
}