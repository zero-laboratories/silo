import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../../../src/storage/database.js';
import { ChatManager } from '../../../src/chat/session.js';
import type { LLMProvider } from '../../../src/models/types.js';
import type { ModelConfig } from '../../../src/config/type.js';

async function makeManager(
  models: Record<string, ModelConfig>,
  current = 'claude',
): Promise<{ manager: ChatManager; store: Store }> {
  const { Store } = await import('../../../src/storage/database.js');
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));
  const config = models[current];
  const provider: LLMProvider = {
    async *sendMessage() {
      yield { type: 'content', content: 'hello' };
    },
    getName: () => 'test',
    getDefaultModel: () => 'test-model',
  };
  const manager = new ChatManager(store, provider, config, {}, models);
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