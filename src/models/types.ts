import type { ChatMessage } from '../chat/types.js';
import type { ModelConfig } from '../config/type.js';

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface StreamChunk {
  type: 'content' | 'tool' | 'status' | 'error' | 'done';
  content?: string;
  tool?: ToolCall;
  status?: string;
  error?: string;
}

export interface LLMProvider {
  sendMessage(
    messages: ChatMessage[],
    config: ModelConfig,
    signal?: AbortSignal,
    tools?: ToolDefinition[],
  ): AsyncGenerator<StreamChunk>;
  getName(): string;
  getDefaultModel(): string;
}

export function apiKeyFor(config: ModelConfig): string {
  if (!config.api_key_env) {
    throw new Error(`No api_key_env set for provider "${config.provider}".`);
  }
  const key = process.env[config.api_key_env];
  if (!key) {
    throw new Error(
      `API key for ${config.provider} not found. Set ${config.api_key_env} or configure it in settings.`,
    );
  }
  return key;
}
