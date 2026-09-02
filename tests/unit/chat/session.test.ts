import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../../../src/storage/database.js';
import { ChatManager } from '../../../src/chat/session.js';
import { TimeoutError } from '../../../src/error/index.js';
import type { LLMProvider } from '../../../src/models/types.js';
import type { ModelConfig } from '../../../src/config/type.js';

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

  it('lists chats created', async () => {
    const { manager, store } = await makeManager(models);
    expect(manager.listChats()).toHaveLength(1);
    store.close();
  });

  it('starts a new chat and switches sessions', async () => {
    const { manager, store } = await makeManager(models);
    const first = manager.session.id;
    manager.newChat();
    expect(manager.session.id).not.toBe(first);
    const created = manager.listChats();
    expect(created).toHaveLength(2);
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
    expect(manager.listChats()).toHaveLength(1);
    expect(manager.listChats()[0]?.id).toBe(manager.session.id);
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