import type { StreamChunk, ToolCall, ToolDefinition } from './types.js';
import { readSse } from './stream.js';
import type { ChatMessage } from '../chat/types.js';

export interface OpenAIChatMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAICompatEvent {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }> | null;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

export function serializeOpenAIMessages(messages: ChatMessage[]): OpenAIChatMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content: m.content ?? '',
      };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: '',
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export function buildToolsPayload(tools: ToolDefinition[]): unknown[] | undefined {
  if (tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: 'object' },
    },
  }));
}

export async function* streamOpenAICompat(
  response: Response,
  name: string,
  onError: (msg: string) => never,
): AsyncGenerator<StreamChunk> {
  const toolCalls = new Map<number, ToolCall>();

  for await (const event of readSse(response, name)) {
    if (event.data === '[DONE]') break;
    let parsed: OpenAICompatEvent;
    try {
      parsed = JSON.parse(event.data) as OpenAICompatEvent;
    } catch {
      continue;
    }
    if (parsed.error?.message) onError(parsed.error.message);

    const choice = parsed.choices?.[0];
    if (!choice) continue;

    const delta = choice.delta ?? {};
    if (delta.content) yield { type: 'content', content: delta.content };

    for (const tc of delta.tool_calls ?? []) {
      const current = toolCalls.get(tc.index) ?? { id: '', name: '', arguments: '' };
      if (tc.id) current.id = tc.id;
      if (tc.function?.name) current.name = tc.function.name;
      if (tc.function?.arguments) current.arguments += tc.function.arguments;
      toolCalls.set(tc.index, current);
    }

    if (choice.finish_reason === 'tool_calls') {
      for (const tc of toolCalls.values()) {
        if (tc.id && tc.name) yield { type: 'tool', tool: tc };
      }
      yield { type: 'done' };
      return;
    }
  }

  yield { type: 'done' };
}