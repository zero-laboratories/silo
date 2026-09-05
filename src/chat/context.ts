import type { ChatMessage } from './types.js';

const BUFFER_TOKENS = 500;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ContextManager {
  private readonly maxTokens: number;

  constructor(modelMaxTokens: number) {
    this.maxTokens = modelMaxTokens - BUFFER_TOKENS;
  }

  buildContext(messages: ChatMessage[], systemPrompt: string | string[]): ChatMessage[] {
    const systemParts = (Array.isArray(systemPrompt) ? systemPrompt : [systemPrompt]).filter(
      (p) => p.length > 0,
    );
    const head: ChatMessage[] = [];
    let totalTokens = 0;
    for (const [index, part] of systemParts.entries()) {
      totalTokens += estimateTokens(part);
      head.push({
        role: 'system',
        content: part,
        timestamp: new Date(),
        id: `system-${index}`,
      });
    }

    const reversed = [...messages].reverse();
    let truncated = false;
    const selected: ChatMessage[] = [];

    for (const msg of reversed) {
      const msgTokens = estimateTokens(msg.content);
      if (totalTokens + msgTokens > this.maxTokens) {
        truncated = true;
        break;
      }
      totalTokens += msgTokens;
      selected.unshift(msg);
    }

    if (truncated) {
      head.push({
        role: 'system',
        content: '... (earlier messages truncated due to context length)',
        timestamp: new Date(),
        id: 'truncated',
      });
    }

    return [...head, ...selected];
  }
}
