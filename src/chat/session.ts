import type { Store } from '../storage/database.js';
import type { LLMProvider, StreamChunk } from '../models/types.js';
import type { ModelConfig } from '../config/type.js';
import type { ChatMessage, ChatSession } from './types.js';
import { ContextManager, estimateTokens } from './context.js';

export interface ChatManagerOptions {
  resume?: boolean;
}

export class ChatManager {
  private store: Store;
  private provider: LLMProvider;
  private config: ModelConfig;
  private current: ChatSession;

  constructor(
    store: Store,
    provider: LLMProvider,
    config: ModelConfig,
    opts: ChatManagerOptions = {},
  ) {
    this.store = store;
    this.provider = provider;
    this.config = config;

    if (opts.resume) {
      this.current =
        store.listChats()[0] ??
        store.createChat({
          model: config.model,
          provider: config.provider,
          title: undefined,
          systemPrompt: '',
        });
    } else {
      this.current = store.createChat({
        model: config.model,
        provider: config.provider,
        title: undefined,
        systemPrompt: '',
      });
    }
  }

  get session(): ChatSession {
    return this.current;
  }

  async *send(userMessage: string): AsyncGenerator<StreamChunk> {
    const savedUser: ChatMessage = this.store.appendMessage(this.current.id, {
      role: 'user',
      content: userMessage,
      tokens: estimateTokens(userMessage),
    });
    this.current.messages.push(savedUser);

    const manager = new ContextManager(this.config.max_tokens ?? 8000);
    const context = manager.buildContext(this.current.messages, this.current.systemPrompt);

    let response = '';
    for await (const chunk of this.provider.sendMessage(context, this.config)) {
      if (chunk.type === 'content' && chunk.content) {
        response += chunk.content;
        yield chunk;
      }
    }

    const savedAssistant: ChatMessage = this.store.appendMessage(this.current.id, {
      role: 'assistant',
      content: response,
      tokens: estimateTokens(response),
    });
    this.current.messages.push(savedAssistant);
    yield { type: 'done' };
  }
}
