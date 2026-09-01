import type { LLMProvider, StreamChunk } from './types.js';
import { apiKeyFor } from './types.js';
import { stream } from './stream.js';
import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

interface GeminiEvent {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

export class GeminiProvider implements LLMProvider {
  getName(): string {
    return 'google';
  }

  getDefaultModel(): string {
    return 'gemini-1.5-flash';
  }

  async *sendMessage(
    messages: ChatMessage[],
    config: ModelConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const apiKey = apiKeyFor(config);
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}` +
      `:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.max_tokens ?? 2000,
        },
      }),
      signal,
    });

    yield* stream<GeminiEvent>(response, 'Gemini', {
      onEvent: (parsed) => {
        if (parsed.error?.message) {
          throw new Error(parsed.error.message);
        }
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ?? undefined;
      },
    });
  }
}
