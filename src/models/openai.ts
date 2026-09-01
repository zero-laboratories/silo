import type { LLMProvider, StreamChunk } from './types.js';
import { apiKeyFor } from './types.js';
import { stream } from './stream.js';
import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

interface OpenAiEvent {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

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
  ): AsyncGenerator<StreamChunk> {
    const apiKey = apiKeyFor(config);
    const chatMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
          messages: chatMessages,
          stream: true,
        }),
        signal,
      },
    );

    yield* stream<OpenAiEvent>(response, 'OpenAI', {
      onEvent: (parsed) => {
        if (parsed.error?.message) {
          throw new Error(parsed.error.message);
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        return delta ?? undefined;
      },
    });
  }
}
