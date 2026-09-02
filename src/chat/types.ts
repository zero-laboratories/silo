export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  id: string;
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
