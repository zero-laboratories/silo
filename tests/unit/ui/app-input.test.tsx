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

describe('App keyboard input', () => {
  it('renders typed characters into the prompt box', async () => {
    const { Store } = await import('../../../src/storage/database.js');
    const store: Store = new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));
    const manager = new ChatManager(store, provider, model, {}, models);
    const config = makeConfig();

    const setup = await testRender(
      <App manager={manager} config={config} />,
      { width: 80, height: 24 },
    );
    try {
      await setup.waitForFrame((frame) => frame.includes('Ask anything...'));
      setup.mockInput.pressKey('a');
      setup.mockInput.pressKey('b');
      setup.mockInput.pressKey('c');
      const frame = await setup.waitForFrame((f) => f.includes('abc'));
      expect(frame).toContain('abc');
      expect(frame).not.toContain('Ask anything...');
    } finally {
      await setup.renderer.destroy();
      store.close();
    }
  });
});
