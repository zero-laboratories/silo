import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../../src/storage/database.js';

function makeStore(): { store: Store; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'silo-test-'));
  const store = new Store(join(dir, 'test.db'));
  return {
    store,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('Store', () => {
  it('creates and retrieves a chat', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'claude-3-5-sonnet-latest',
      provider: 'anthropic',
      systemPrompt: '',
      title: undefined,
    });

    expect(chat.id).toBeTruthy();
    const fetched = store.getChat(chat.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.model).toBe('claude-3-5-sonnet-latest');
    cleanup();
  });

  it('persists messages in order', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: '',
      title: undefined,
    });

    store.appendMessage(chat.id, { role: 'user', content: 'first' });
    store.appendMessage(chat.id, { role: 'assistant', content: 'reply' });

    const fetched = store.getChat(chat.id)!;
    expect(fetched.messages.map((m) => m.content)).toEqual(['first', 'reply']);
    expect(fetched.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    cleanup();
  });

  it('lists chats newest first', () => {
    const { store, cleanup } = makeStore();
    const a = store.createChat({
      model: 'm1',
      provider: 'anthropic',
      systemPrompt: '',
      title: 'a',
    });
    store.appendMessage(a.id, { role: 'user', content: 'bump' });
    const b = store.createChat({
      model: 'm2',
      provider: 'openai',
      systemPrompt: '',
      title: 'b',
    });

    expect(store.listChats()[0].id).toBe(b.id);
    cleanup();
  });

  it('deletes a chat and its messages', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'm',
      provider: 'anthropic',
      systemPrompt: '',
      title: undefined,
    });
    store.appendMessage(chat.id, { role: 'user', content: 'x' });
    store.deleteChat(chat.id);

    expect(store.getChat(chat.id)).toBeNull();
    expect(store.listChats()).toHaveLength(0);
    cleanup();
  });

  it('persists tags on a chat', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'm',
      provider: 'anthropic',
      systemPrompt: '',
      title: undefined,
      tags: ['rust', 'docs'],
    });
    expect(store.getChat(chat.id)?.tags).toEqual(['rust', 'docs']);
    store.setChatTags(chat.id, ['dev']);
    expect(store.getChat(chat.id)?.tags).toEqual(['dev']);
    cleanup();
  });

  it('sets a per-chat system prompt', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'm',
      provider: 'anthropic',
      systemPrompt: '',
      title: undefined,
    });
    store.setSystemPrompt(chat.id, 'You are helpful.');
    expect(store.getChat(chat.id)?.systemPrompt).toBe('You are helpful.');
    cleanup();
  });

  it('updates and deletes a message', () => {
    const { store, cleanup } = makeStore();
    const chat = store.createChat({
      model: 'm',
      provider: 'anthropic',
      systemPrompt: '',
      title: undefined,
    });
    const msg = store.appendMessage(chat.id, { role: 'user', content: 'hello' });
    store.updateMessage(chat.id, msg.id, 'goodbye');
    expect(store.getChat(chat.id)?.messages[0].content).toBe('goodbye');
    store.deleteMessage(chat.id, msg.id);
    expect(store.getChat(chat.id)?.messages).toHaveLength(0);
    cleanup();
  });

  it('does not update or delete messages across chats', () => {
    const { store, cleanup } = makeStore();
    const a = store.createChat({ model: 'm', provider: 'anthropic', systemPrompt: '', title: undefined });
    const b = store.createChat({ model: 'm', provider: 'anthropic', systemPrompt: '', title: undefined });
    const msg = store.appendMessage(a.id, { role: 'user', content: 'hello' });
    store.updateMessage(b.id, msg.id, 'mutated');
    store.deleteMessage(b.id, msg.id);
    expect(store.getChat(a.id)?.messages[0].content).toBe('hello');
    cleanup();
  });
});
