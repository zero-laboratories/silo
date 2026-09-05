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
    yield { type: 'content', content: 'hello reply' };
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

async function renderApp() {
  const { Store } = await import('../../../src/storage/database.js');
  const store: Store = new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));
  const manager = new ChatManager(store, provider, model, {}, models);
  const config = makeConfig();
  const setup = await testRender(<App manager={manager} config={config} />, { width: 80, height: 24 });
  return { store, manager, setup };
}

type Setup = Awaited<ReturnType<typeof renderApp>>['setup'];

async function settle(ms = 40) {
  await new Promise((r) => setTimeout(r, ms));
}

async function sendMessage(setup: Setup, text: string) {
  await setup.waitForFrame((f) => f.includes('Ask anything...'));
  for (const ch of text) setup.mockInput.pressKey(ch);
  await setup.waitForFrame((f) => f.includes(text));
  setup.mockInput.pressEnter();
  await setup.waitForFrame((f) => f.includes(text) && f.includes('Ask anything...'));
}

async function blurPrompt(setup: Setup) {
  await setup.mockMouse.click(10, 8);
  await setup.waitForFrame((f) => f.includes('Click to type'));
}

describe('App prompt focus', () => {
  it('types the letter E as a normal character while the prompt is focused by default', async () => {
    const { store, setup } = await renderApp();
    try {
      await setup.waitForFrame((f) => f.includes('Ask anything...'));
      setup.mockInput.pressKey('e');
      setup.mockInput.pressKey('n');
      setup.mockInput.pressKey('d');
      const frame = await setup.waitForFrame((f) => f.includes('end'));
      expect(frame).toContain('end');
      expect(frame).not.toContain('Select:');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });

  it('opens message editing with E after clicking outside the prompt', async () => {
    const { store, setup } = await renderApp();
    try {
      await sendMessage(setup, 'hello');
      await blurPrompt(setup);
      setup.mockInput.pressKey('e');
      const frame = await setup.waitForFrame((f) => f.includes('Select:'));
      expect(frame).toContain('Select:');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });

  it('clicking the prompt re-focuses typing after a blur', async () => {
    const { store, setup } = await renderApp();
    try {
      await sendMessage(setup, 'hello');
      await blurPrompt(setup);
      setup.mockInput.pressKey('e');
      await setup.waitForFrame((f) => f.includes('Select:'));
      setup.mockInput.pressKey('ESCAPE');
      await settle();
      await setup.waitForFrame((f) => f.includes('Ask anything...'));
      await blurPrompt(setup);
      await setup.mockMouse.click(40, 22);
      await setup.waitForFrame((f) => f.includes('Ask anything...'));
      setup.mockInput.pressKey('e');
      const frame = await setup.waitForFrame((f) => f.includes('e'));
      expect(frame).toContain('e');
      expect(frame).not.toContain('Select:');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });
});