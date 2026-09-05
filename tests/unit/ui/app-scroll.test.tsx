import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { testRender } from '@opentui/react/test-utils';
import type { Store } from '../../../src/storage/database.js';
import { ChatManager } from '../../../src/chat/session.js';
import type { LLMProvider } from '../../../src/models/types.js';
import type { ModelConfig, SiloConfig } from '../../../src/config/type.js';
import { App } from '../../../src/ui/components/App.js';

const model: ModelConfig = { provider: 'anthropic', model: 'claude-3-5-sonnet' };
const models: Record<string, ModelConfig> = { claude: model };

const provider: LLMProvider = {
  async *sendMessage() {
    yield { type: 'content', content: 'hi' };
  },
  getName: () => 'test',
  getDefaultModel: () => 'test-model',
};

function makeConfig(): SiloConfig {
  return {
    general: { default_model: 'claude' },
    providers: {},
    models,
  } as unknown as SiloConfig;
}

function seedMessages(store: Store, chatId: string, n: number, label: string): void {
  for (let i = 0; i < n; i++) {
    store.appendMessage(chatId, {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${label} message ${i} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod`,
      tokens: 20,
    });
  }
}

async function makeStore(): Promise<Store> {
  const { Store } = await import('../../../src/storage/database.js');
  return new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));
}

describe('chat scroll', () => {
  it('opens at the latest message and Home/End jump the conversation', async () => {
    const store = await makeStore();
    const chat = store.createChat({ model: model.model, provider: model.provider, title: undefined, systemPrompt: '' });
    seedMessages(store, chat.id, 42, 'A');
    const manager = new ChatManager(store, provider, model, { resume: true }, models);

    const setup = await testRender(
      <App manager={manager} config={makeConfig()} />,
      { width: 100, height: 24 },
    );
    try {
      await setup.waitForVisualIdle();
      await new Promise((r) => setTimeout(r, 60));

      setup.mockInput.pressKey('HOME');
      await new Promise((r) => setTimeout(r, 120));
      const topFrame = setup.captureCharFrame();
      expect(topFrame).toContain('A message 0');
      expect(topFrame).not.toContain('A message 41');

      await new Promise((r) => setTimeout(r, 80));
      setup.mockInput.pressKey('END');
      await new Promise((r) => setTimeout(r, 120));
      const endFrame = setup.captureCharFrame();
      expect(endFrame).toContain('A message 41');
      expect(endFrame).not.toContain('A message 0');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });

  it('keeps the prompt visible and pinned when a long chat overflows', async () => {
    const store = await makeStore();
    const chat = store.createChat({ model: model.model, provider: model.provider, title: undefined, systemPrompt: '' });
    seedMessages(store, chat.id, 60, 'B');
    const manager = new ChatManager(store, provider, model, { resume: true }, models);

    const setup = await testRender(
      <App manager={manager} config={makeConfig()} />,
      { width: 100, height: 24 },
    );
    try {
      const frame = await setup.waitForFrame((frame) => frame.includes('Ask anything...'));
      expect(frame).toContain('B message 59');
      expect(frame).not.toContain('B message 0');
      expect(frame.split('\n').length).toBeGreaterThanOrEqual(24);
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });

  it('resets the scroll when switching to another chat', async () => {
    const store = await makeStore();
    const b = store.createChat({ model: model.model, provider: model.provider, title: 'B', systemPrompt: '' });
    seedMessages(store, b.id, 70, 'B');
    const a = store.createChat({ model: model.model, provider: model.provider, title: 'A', systemPrompt: '' });
    seedMessages(store, a.id, 42, 'A');
    const manager = new ChatManager(store, provider, model, { resume: true }, models);

    const setup = await testRender(
      <App manager={manager} config={makeConfig()} />,
      { width: 100, height: 24 },
    );
    try {
      await setup.waitForVisualIdle();
      await new Promise((r) => setTimeout(r, 60));

      setup.mockInput.pressKey('HOME');
      await new Promise((r) => setTimeout(r, 120));
      const topA = setup.captureCharFrame();
      expect(topA).toContain('A message 0');
      expect(topA).not.toContain('A message 41');

      setup.mockInput.pressKey('s', { ctrl: true });
      await new Promise((r) => setTimeout(r, 60));

      setup.mockInput.pressKey('ARROW_DOWN');
      await new Promise((r) => setTimeout(r, 40));
      setup.mockInput.pressKey('RETURN');
      await new Promise((r) => setTimeout(r, 160));
      const switched = setup.captureCharFrame();
      const vis = switched.split('\n').filter(Boolean).map((l) => l.trim()).filter((l) => l.startsWith('B message'));
      expect(vis.length).toBeGreaterThan(0);
      expect(switched).toContain('B message 67');
      expect(switched).not.toContain('B message 0');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });
});