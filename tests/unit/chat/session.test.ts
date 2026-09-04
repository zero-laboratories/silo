import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../../../src/storage/database.js';
import { ChatManager } from '../../../src/chat/session.js';
import { TimeoutError } from '../../../src/error/index.js';
import type { LLMProvider } from '../../../src/models/types.js';
import type { ModelConfig } from '../../../src/config/type.js';
import type { McpRegistry } from '../../../src/mcp/registry.js';

async function makeManager(
  models: Record<string, ModelConfig>,
  current = 'claude',
  provider?: LLMProvider,
): Promise<{ manager: ChatManager; store: Store }> {
  const { Store } = await import('../../../src/storage/database.js');
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));
  const config = models[current];
  const activeProvider: LLMProvider = provider ?? {
    async *sendMessage() {
      yield { type: 'content', content: 'hello' };
    },
    getName: () => 'test',
    getDefaultModel: () => 'test-model',
  };
  const manager = new ChatManager(store, activeProvider, config, {}, models);
  return { manager, store };
}

const models: Record<string, ModelConfig> = {
  claude: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
  gpt: { provider: 'openai', model: 'gpt-4o' },
};

describe('ChatManager', () => {
  it('tracks the active model name', async () => {
    const { manager, store } = await makeManager(models);
    expect(manager.currentModel).toBe('claude');
    store.close();
  });

  it('hides empty chats from the list', async () => {
    const { manager, store } = await makeManager(models);
    expect(manager.listChats()).toHaveLength(0);
    store.close();
  });

  it('lists chats once they have content', async () => {
    const { manager, store } = await makeManager(models);
    const id = manager.session.id;
    for await (const _ of manager.send('hello')) void _;
    expect(manager.listChats()).toHaveLength(1);
    expect(manager.listChats()[0]?.id).toBe(id);
    store.close();
  });

  it('starts a new chat and switches sessions', async () => {
    const { manager, store } = await makeManager(models);
    const first = manager.session.id;
    manager.newChat();
    expect(manager.session.id).not.toBe(first);
    expect(manager.listChats()).toHaveLength(0);
    expect(manager.switchChat(first)).toBe(true);
    expect(manager.session.id).toBe(first);
    store.close();
  });

  it('returns false when switching to an unknown chat', async () => {
    const { manager, store } = await makeManager(models);
    expect(manager.switchChat('nope')).toBe(false);
    store.close();
  });

  it('switches models when configured', async () => {
    const { manager, store } = await makeManager(models);
    const res = manager.switchModel('gpt');
    expect(res.ok).toBe(true);
    expect(manager.currentModel).toBe('gpt');
    expect(manager.label).toBe('openai/gpt-4o');
    store.close();
  });

  it('rejects switching to an unknown model', async () => {
    const { manager, store } = await makeManager(models);
    const res = manager.switchModel('nope');
    expect(res.ok).toBe(false);
    expect(manager.currentModel).toBe('claude');
    store.close();
  });

  it('deletes a chat and falls back to a fresh chat', async () => {
    const { manager, store } = await makeManager(models);
    const first = manager.session.id;
    manager.deleteChat(first);
    expect(manager.session.id).not.toBe(first);
    expect(manager.listChats()).toHaveLength(0);
    store.close();
  });

  it('renames a chat', async () => {
    const { manager, store } = await makeManager(models);
    const id = manager.session.id;
    manager.renameChat(id, 'My new title');
    expect(manager.session.title).toBe('My new title');
    expect(manager.listChats()[0]?.title).toBe('My new title');
    store.close();
  });

  it('deleting a non-active chat keeps the current session', async () => {
    const { manager, store } = await makeManager(models);
    const first = manager.session.id;
    manager.newChat();
    manager.deleteChat(first);
    expect(manager.session.id).not.toBe(first);
    store.close();
  });

  it('sets tags on the current chat', async () => {
    const { manager, store } = await makeManager(models);
    for await (const _ of manager.send('hello')) void _;
    const id = manager.session.id;
    manager.setChatTags(id, ['rust', 'docs']);
    expect(manager.session.tags).toEqual(['rust', 'docs']);
    expect(manager.listChats()[0]?.tags).toEqual(['rust', 'docs']);
    store.close();
  });

  it('sets a per-chat system prompt', async () => {
    const { manager, store } = await makeManager(models);
    const id = manager.session.id;
    manager.setSystemPrompt(id, 'You are concise.');
    expect(manager.session.systemPrompt).toBe('You are concise.');
    store.close();
  });

  it('updates and deletes a message in the current chat', async () => {
    const { manager, store } = await makeManager(models);
    await collect(manager);
    const userMsg = manager.session.messages.find((m) => m.role === 'user')!;
    manager.updateMessage(manager.session.id, userMsg.id, 'edited text');
    expect(manager.session.messages.find((m) => m.id === userMsg.id)?.content).toBe('edited text');
    manager.deleteMessage(manager.session.id, userMsg.id);
    expect(manager.session.messages.find((m) => m.id === userMsg.id)).toBeUndefined();
    store.close();
  });

  it('searches messages within the chat', async () => {
    const { manager, store } = await makeManager(models);
    await collect(manager);
    const res = manager.searchChat(manager.session.id, 'hello');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].content).toBe('hello');
    expect(manager.searchChat(manager.session.id, 'nothere')).toHaveLength(0);
    store.close();
  });
});

function hangingProvider(): LLMProvider {
  return {
    async *sendMessage(_messages, _config, signal) {
      await new Promise<never>((_, reject) => {
        if (signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    },
    getName: () => 'test',
    getDefaultModel: () => 'test-model',
  };
}

async function collect(manager: ChatManager, signal?: AbortSignal): Promise<string> {
  let out = '';
  for await (const chunk of manager.send('hi', signal)) {
    if (chunk.type === 'content') out += chunk.content;
  }
  return out;
}

describe('ChatManager.send', () => {
  it('auto-generates a title from the first user message', async () => {
    const { manager, store } = await makeManager(models);
    await collect(manager);
    expect(manager.session.title).toBe('hi');
    store.close();
  });

  it('truncates the auto title to 36 chars on a word boundary', async () => {
    const longMsg =
      'I want to plan a very long and detailed trip around Japan that is focused on trains and rail passes';
    const { manager, store } = await makeManager(models);
    for await (const _ of manager.send(longMsg)) void _;
    expect(manager.session.title?.length).toBeLessThanOrEqual(37);
    expect(manager.session.title?.endsWith('…')).toBe(true);
    store.close();
  });

  it('refreshes the title from a background AI generation', async () => {
    const aiProvider: LLMProvider = {
      async *sendMessage() {
        yield { type: 'content', content: 'Japan Train Travel Planning' };
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', aiProvider);
    await collect(manager);
    const title = await manager.generateTitle(manager.session.id);
    expect(title).toBe('Japan Train Travel Planning');
    expect(manager.session.title).toBe('Japan Train Travel Planning');
    store.close();
  });

  it('truncates an overlong AI-generated title to 36 chars', async () => {
    const aiProvider: LLMProvider = {
      async *sendMessage() {
        yield { type: 'content', content: 'the quick brown fox jumps over the lazy dog' };
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', aiProvider);
    await collect(manager);
    const title = await manager.generateTitle(manager.session.id);
    expect(title?.length).toBeLessThanOrEqual(36);
    store.close();
  });

  it('keeps the auto title when AI generation fails', async () => {
    let calls = 0;
    const flaky: LLMProvider = {
      async *sendMessage() {
        calls++;
        if (calls === 1) {
          yield { type: 'content', content: 'hello' };
          return;
        }
        throw new Error('boom');
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', flaky);
    await collect(manager);
    const title = await manager.generateTitle(manager.session.id);
    expect(title).toBeNull();
    expect(manager.session.title).toBe('hi');
    store.close();
  });

  it('persists the assistant message on a normal reply', async () => {
    const { manager, store } = await makeManager(models);
    expect(await collect(manager)).toBe('hello');
    const msgs = manager.session.messages;
    expect(msgs.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(msgs.filter((m) => m.role === 'assistant')).toHaveLength(1);
    store.close();
  });

  it('raises a TimeoutError when the provider hangs', async () => {
    const withTimeout: Record<string, ModelConfig> = {
      claude: { provider: 'anthropic', model: 'x', timeout: 0.05 },
    };
    const { manager, store } = await makeManager(withTimeout, 'claude', hangingProvider());
    await expect(collect(manager)).rejects.toThrow(TimeoutError);
    store.close();
  });

  it('persists the partial response when the user aborts mid-stream', async () => {
    const partialThenHang: LLMProvider = {
      async *sendMessage(_messages, _config, signal) {
        yield { type: 'content', content: 'partial answer' };
        await new Promise<never>((_, reject) => {
          if (signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', partialThenHang);
    const controller = new AbortController();
    const it = manager.send('hi', controller.signal);
    const first = await it.next();
    expect(first.value.type).toBe('content');
    expect(first.value.content).toBe('partial answer');
    controller.abort();
    const second = await it.next();
    expect(second.value.type).toBe('done');
    const assistants = manager.session.messages.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe('partial answer');
    store.close();
  });

  it('does not persist anything when aborted before any content', async () => {
    const { manager, store } = await makeManager(models, 'claude', hangingProvider());
    const controller = new AbortController();
    const p = collect(manager, controller.signal);
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    await expect(p).resolves.toBe('');
    expect(manager.session.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
    store.close();
  });

  it('propagates provider errors without persisting a partial', async () => {
    const busted: LLMProvider = {
      async *sendMessage() {
        yield { type: 'content', content: 'so close' };
        throw new Error('model exploded');
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', busted);
    await expect(collect(manager)).rejects.toThrow('model exploded');
    expect(manager.session.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
    store.close();
  });
});

describe('ChatManager MCP tool loop', () => {
  const toolOnlyProvider = (toolName: string): LLMProvider => ({
    async *sendMessage() {
      yield {
        type: 'tool',
        tool: { id: 'call_1', name: toolName, arguments: '{"city":"Paris"}' },
      };
    },
    getName: () => 'test',
    getDefaultModel: () => 'test-model',
  });

  function fakeMcp(overrides: Partial<McpRegistry> = {}): McpRegistry {
    return {
      listTools: vi.fn(async () => [{ name: 'srv__weather', description: 'Get weather' }]),
      callTool: vi.fn(async () => 'sunny, 24C'),
      ...overrides,
    } as unknown as McpRegistry;
  }

  it('executes a tool call and feeds the result back for the final answer', async () => {
    const receivedMessages: Array<Array<{ role: string; content: string; toolCalls?: unknown[]; toolCallId?: string }>> = [];
    const provider: LLMProvider = {
      async *sendMessage(messages: never[]) {
        const snapshot = messages.map((m: { role: string; content: string; toolCalls?: unknown[]; toolCallId?: string }) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls,
          toolCallId: m.toolCallId,
        }));
        receivedMessages.push(snapshot);
        if (receivedMessages.length === 1) {
          yield {
            type: 'tool',
            tool: { id: 'call_1', name: 'srv__weather', arguments: '{"city":"Paris"}' },
          };
        } else {
          yield { type: 'content', content: 'It is sunny and 24C.' };
        }
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };

    const mcp = fakeMcp();
    const { manager, store } = await makeManager(models, 'claude', provider);
    (manager as unknown as { mcp: McpRegistry | null }).mcp = mcp;

    const out = await collect(manager);
    expect(out).toBe('It is sunny and 24C.');

    const assistant = manager.session.messages.filter((m) => m.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0].content).toBe('It is sunny and 24C.');

    expect(mcp.callTool).toHaveBeenCalledWith('srv__weather', { city: 'Paris' });
    const second = receivedMessages[1];
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe('assistant');
    expect(second[1].toolCalls).toEqual([
      { id: 'call_1', name: 'srv__weather', arguments: '{"city":"Paris"}' },
    ]);
    expect(second[2].role).toBe('tool');
    expect(second[2].toolCallId).toBe('call_1');
    expect(second[2].content).toBe('sunny, 24C');
    store.close();
  });

  it('feeds a tool execution error back to the model', async () => {
    const mcp = fakeMcp({
      callTool: vi.fn(async () => {
        throw new Error('tool exploded');
      }),
    });
    const provider: LLMProvider = {
      async *sendMessage(messages: never[]) {
        const hasToolResult = messages.some(
          (m: { role?: string }) => (m as { role?: string }).role === 'tool',
        );
        if (hasToolResult) yield { type: 'content', content: 'I hit an error.' };
        else
          yield {
            type: 'tool',
            tool: { id: 'call_9', name: 'srv__weather', arguments: '{}' },
          };
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };

    const { manager, store } = await makeManager(models, 'claude', provider);
    (manager as unknown as { mcp: McpRegistry | null }).mcp = mcp;

    const out = await collect(manager);
    expect(out).toBe('I hit an error.');
    const toolMsg = manager.session.messages;
    expect(toolMsg.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
    store.close();
  });

  it('runs a chain of tool turns until the model stops calling tools', async () => {
    let calls = 0;
    const mcp = fakeMcp({
      callTool: vi.fn(async () => 'ok'),
    });
    const provider: LLMProvider = {
      async *sendMessage() {
        calls++;
        if (calls < 3) {
          yield {
            type: 'tool',
            tool: { id: `call_${calls}`, name: 'srv__weather', arguments: '{}' },
          };
        } else {
          yield { type: 'content', content: 'done after chaining' };
        }
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };

    const { manager, store } = await makeManager(models, 'claude', provider);
    (manager as unknown as { mcp: McpRegistry | null }).mcp = mcp;

    expect(await collect(manager)).toBe('done after chaining');
    expect(calls).toBe(3);
    expect(mcp.callTool).toHaveBeenCalledTimes(2);
    store.close();
  });

  it('bounds the number of tool turns', async () => {
    const provider: LLMProvider = {
      async *sendMessage() {
        yield {
          type: 'tool',
          tool: { id: 'call_x', name: 'srv__weather', arguments: '{}' },
        };
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const mcp = fakeMcp({ callTool: vi.fn(async () => 'ok') });
    const { manager, store } = await makeManager(models, 'claude', provider);
    (manager as unknown as { mcp: McpRegistry | null }).mcp = mcp;

    // Should terminate rather than loop forever.
    await collect(manager);
    const maxBound = 8;
    expect(mcp.callTool).toHaveBeenCalledTimes(maxBound);
    store.close();
  });

  it('skips the tool loop entirely when no MCP registry is present', async () => {
    const provider: LLMProvider = {
      async *sendMessage() {
        yield { type: 'content', content: 'plain reply' };
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };
    const { manager, store } = await makeManager(models, 'claude', provider);
    expect(await collect(manager)).toBe('plain reply');
    store.close();
  });
});