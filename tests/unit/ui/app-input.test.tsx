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
import type { McpRegistry } from '../../../src/mcp/registry.js';
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

describe('App tool status', () => {
  it('surfaces tool execution while streaming', async () => {
    const { Store } = await import('../../../src/storage/database.js');
    const store: Store = new Store(join(mkdtempSync(join(tmpdir(), 'silo-test-')), 'test.db'));

    const gate = { release: null as (() => void) | null };
    const toolGate = new Promise<void>((resolve) => {
      gate.release = resolve;
    });

    const mcp = {
      listTools: async () => [{ name: 'srv__weather', description: 'Get weather' }],
      callTool: async () => {
        await toolGate;
        return 'sunny, 24C';
      },
    } as unknown as McpRegistry;

    let providerCalls = 0;
    const provider: LLMProvider = {
      async *sendMessage() {
        providerCalls++;
        if (providerCalls === 1) {
          yield { type: 'tool', tool: { id: 'c1', name: 'srv__weather', arguments: '{}' } };
        } else {
          yield { type: 'content', content: 'It is sunny and 24C.' };
        }
      },
      getName: () => 'test',
      getDefaultModel: () => 'test-model',
    };

    const manager = new ChatManager(store, provider, model, {}, models, mcp);
    const config = makeConfig();

    const setup = await testRender(
      <App manager={manager} config={config} />,
      { width: 80, height: 24 },
    );
    try {
      await setup.waitForFrame((frame) => frame.includes('Ask anything...'));
      for (const ch of ['a', 'b', 'c']) {
        setup.mockInput.pressKey(ch);
      }
      await setup.waitForFrame((frame) => frame.includes('abc'));
      setup.mockInput.pressEnter();

      await setup.waitForFrame((frame) => frame.includes('Running srv · weather…'));
      expect(setup.captureCharFrame()).toContain('⚙');

      gate.release?.();
      await setup.waitForFrame((frame) => frame.includes('It is sunny and 24C.'));
    } finally {
      gate.release?.();
      await setup.renderer.destroy();
      store.close();
    }
  });
});
