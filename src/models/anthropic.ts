import type { LLMProvider, StreamChunk } from './types.js';
import { apiKeyFor } from './types.js';
import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

export class AnthropicProvider implements LLMProvider {
  getName(): string {
    return 'anthropic';
  }

  getDefaultModel(): string {
    return 'claude-3-5-sonnet-latest';
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
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens ?? 2000,
        temperature: config.temperature ?? 0.7,
        system: system || undefined,
        messages: chatMessages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.delta?.text;
            if (typeof delta === 'string' && delta.length > 0) {
              yield { type: 'content', content: delta };
            }
          } catch {
            // Ignore non-JSON keepalive lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}
