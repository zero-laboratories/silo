import type { LLMProvider, StreamChunk, ToolDefinition } from './types.js';
import { apiKeyFor } from './types.js';
import { buildToolsPayload, serializeOpenAIMessages, streamOpenAICompat } from './openai_compat.js';
import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

export class OpenAIProvider implements LLMProvider {
  getName(): string {
    return 'openai';
  }

  getDefaultModel(): string {
    return 'gpt-4o';
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
      config.base_url ?? 'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
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

    yield* streamOpenAICompat(response, 'OpenAI', (msg) => {
      throw new Error(msg);
    });
  }
}