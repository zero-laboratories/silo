import type { LLMProvider, StreamChunk, ToolDefinition } from './types.js';
import { apiKeyFor } from './types.js';
import { buildToolsPayload, serializeOpenAIMessages, streamOpenAICompat } from './openai_compat.js';
import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

export class OpenRouterProvider implements LLMProvider {
  getName(): string {
    return 'openrouter';
  }

  getDefaultModel(): string {
    return 'poolside-ai/laguna-2.1-xs';
  }

  async *sendMessage(
    messages: ChatMessage[],
    config: ModelConfig,
    signal?: AbortSignal,
    tools?: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    const apiKey = apiKeyFor(config);
    const toolsPayload = buildToolsPayload(tools ?? []);

    const response = await fetch(
      config.base_url ?? 'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/zeropbc/silo',
          'X-Title': 'Silo',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.max_tokens ?? 2000,
          temperature: config.temperature ?? 0.7,
          messages: serializeOpenAIMessages(messages),
          stream: true,
          ...(toolsPayload !== undefined ? { tools: toolsPayload } : {}),
        }),
        signal,
      },
    );

    yield* streamOpenAICompat(response, 'OpenRouter', (msg) => {
      throw new Error(msg);
    });
  }
}