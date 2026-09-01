import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './google.js';
import { OpenRouterProvider } from './openrouter.js';

const providers: Record<string, () => LLMProvider> = {
  anthropic: () => new AnthropicProvider(),
  claude: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  google: () => new GeminiProvider(),
  gemini: () => new GeminiProvider(),
  openrouter: () => new OpenRouterProvider(),
};

export function providerFor(name: string): LLMProvider {
  const factory = providers[name];
  if (!factory) {
    throw new Error(`Provider "${name}" is not supported.`);
  }
  return factory();
}
