import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { McpServerConfig } from '../../../src/config/type.js';
import { McpRegistry } from '../../../src/mcp/registry.js';
import type { BuiltinTool } from '../../../src/tools/types.js';
import { SiloError } from '../../../src/error/index.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'mcp-server.mjs');

const fixtureConfig: McpServerConfig = {
  command: process.execPath,
  args: [fixturePath],
};

function echoTool(response: string): BuiltinTool {
  return {
    namespace: 'builtin',
    name: 'echo',
    description: 'Echoes input',
    inputSchema: { type: 'object' },
    run: async () => response,
  };
}

describe('McpRegistry', () => {
  it('aggregates tools across servers with namespaced names', async () => {
    const registry = new McpRegistry({
      files: fixtureConfig,
      web: fixtureConfig,
    });
    const tools = await registry.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'files__weather',
      'files__ping',
      'web__weather',
      'web__ping',
    ]);
    await registry.closeAll();
  });

  it('routes a call to the correct server by namespace', async () => {
    const registry = new McpRegistry({ web: fixtureConfig });
    const result = await registry.callTool('web__echo', { a: 1 });
    expect(result).toBe('echo:{"a":1}');
    await registry.closeAll();
  });

  it('surfaces isError results with an Error prefix', async () => {
    const registry = new McpRegistry({ web: fixtureConfig });
    const result = await registry.callTool('web__boom', {});
    expect(result).toMatch(/^Error: something failed$/);
    await registry.closeAll();
  });

  it('skips disabled servers', async () => {
    const registry = new McpRegistry({
      web: { ...fixtureConfig, enabled: false },
    });
    expect(await registry.listTools()).toEqual([]);
    await registry.closeAll();
  });

  it('rejects unknown namespaced tools', async () => {
    const registry = new McpRegistry({});
    await expect(registry.callTool('nope__x', {})).rejects.toThrow(/unknown MCP tool.*nope__x/i);
    await registry.closeAll();
  });

  it('wraps connection failures in a friendly error', async () => {
    const registry = new McpRegistry({
      broken: { command: '/no/such/binary' },
    });
    await expect(registry.listTools()).rejects.toThrow(/MCP server "broken"/);
    await registry.closeAll();
  });

  it('advertises builtin tools alongside server tools', async () => {
    const registry = new McpRegistry({ web: fixtureConfig }, [echoTool('pong')]);
    const tools = await registry.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'builtin__echo',
      'web__weather',
      'web__ping',
    ]);
    await registry.closeAll();
  });

  it('routes builtin tool calls to the in-process handler', async () => {
    const registry = new McpRegistry({}, [echoTool('builtin says hi')]);
    const result = await registry.callTool('builtin__echo', { anything: true });
    expect(result).toBe('builtin says hi');
    await registry.closeAll();
  });

  it('rejects unknown builtin calls without reaching servers', async () => {
    const registry = new McpRegistry({}, [echoTool('x')]);
    await expect(registry.callTool('builtin__nope', {})).rejects.toThrow(/unknown MCP tool/i);
    await registry.closeAll();
  });

  it('propagates builtin run errors with an Error prefix', async () => {
    const failing: BuiltinTool = {
      namespace: 'builtin',
      name: 'fail',
      description: 'fails',
      inputSchema: { type: 'object' },
      run: async () => {
        throw new SiloError('kaboom');
      },
    };
    const registry = new McpRegistry({}, [failing]);
    await expect(registry.callTool('builtin__fail', {})).rejects.toThrow(/kaboom/);
    await registry.closeAll();
  });
});