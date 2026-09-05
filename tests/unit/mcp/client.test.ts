import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { McpServerConfig } from '../../../src/config/type.js';
import { McpClient } from '../../../src/mcp/client.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'mcp-server.mjs');

const fixtureConfig: McpServerConfig = {
  command: process.execPath,
  args: [fixturePath],
};

describe('McpClient', () => {
  it('performs the initialize handshake and lists tools', async () => {
    const client = new McpClient('fixture', fixtureConfig);
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['weather', 'ping']);
    expect(tools[0]?.description).toBe('Get the weather for a city');
    await client.close();
  });

  it('calls a tool and returns the text content', async () => {
    const client = new McpClient('fixture', fixtureConfig);
    const result = await client.callTool('echo', { hello: 'world' });
    expect(result.content[0]?.text).toBe('echo:{"hello":"world"}');
    expect(result.isError).toBeUndefined();
    await client.close();
  });

  it('flags tool errors via isError', async () => {
    const client = new McpClient('fixture', fixtureConfig);
    const result = await client.callTool('boom', {});
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('rejects when the server command does not exist', async () => {
    const client = new McpClient('missing', { command: '/no/such/binary' });
    await expect(client.listTools()).rejects.toThrow(/failed to start|failed to connect/);
    await client.close();
  });

  it('is idempotent on close', async () => {
    const client = new McpClient('fixture', fixtureConfig);
    await client.listTools();
    await client.close();
    await client.close();
  });
});