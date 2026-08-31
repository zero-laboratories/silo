import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';

export function providerFor(name: string): LLMProvider {
  switch (name) {
    case 'anthropic':
    case 'claude':
      return new AnthropicProvider();
    default:
      throw new Error(`Provider "${name}" is not supported yet.`);
  }
}
