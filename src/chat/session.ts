import type { Store } from '../storage/database.js';
import type { LLMProvider, StreamChunk } from '../models/types.js';
import type { ModelConfig } from '../config/type.js';
import type { ChatMessage, ChatSession } from './types.js';
import { ContextManager, estimateTokens } from './context.js';
import { providerFor } from '../models/index.js';

export interface ChatManagerOptions {
  resume?: boolean;
}

export class ChatManager {
  private store: Store;
  private provider: LLMProvider;
  private config: ModelConfig;
  private models: Record<string, ModelConfig>;
  private modelName: string;
  private current: ChatSession;

  constructor(
    store: Store,
    provider: LLMProvider,
    config: ModelConfig,
    opts: ChatManagerOptions = {},
    models: Record<string, ModelConfig> = {},
  ) {
    this.store = store;
    this.provider = provider;
    this.config = config;
    this.models = models;
    this.modelName = Object.keys(models).find((n) => models[n] === config) ?? 'custom';

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

  get label(): string {
    return `${this.config.provider}/${this.config.model}`;
  }

  listChats(): ChatSession[] {
    return this.store.listChats();
  }

  switchChat(id: string): boolean {
    const chat = this.store.getChat(id);
    if (!chat) return false;
    this.current = chat;
    return true;
  }

  newChat(): void {
    this.current = this.store.createChat({
      model: this.config.model,
      provider: this.config.provider,
      title: undefined,
      systemPrompt: '',
    });
  }

  deleteChat(id: string): void {
    this.store.deleteChat(id);
    if (this.current.id === id) {
      this.current =
        this.store.listChats()[0] ??
        this.store.createChat({
          model: this.config.model,
          provider: this.config.provider,
          title: undefined,
          systemPrompt: '',
        });
    }
  }

  renameChat(id: string, title: string): void {
    this.store.renameChat(id, title);
    if (this.current.id === id) {
      this.current = this.store.getChat(id) ?? this.current;
    }
  }

  modelsByName(): string[] {
    return Object.keys(this.models);
  }

  switchModel(name: string): { ok: boolean; error?: string } {
    const model = this.models[name];
    if (!model) return { ok: false, error: `Model "${name}" is not configured` };
    this.config = model;
    this.modelName = name;
    try {
      this.provider = providerFor(model.provider);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true };
  }

  get currentModel(): string {
    return this.modelName;
  }

  get modelConfig(): ModelConfig {
    return this.config;
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
