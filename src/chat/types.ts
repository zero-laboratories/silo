import type { ToolCall } from '../models/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  tokens?: number;
  id: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ChatSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  model: string;
  provider: string;
  messages: ChatMessage[];
  systemPrompt: string;
  title?: string;
  tags?: string[];
}
