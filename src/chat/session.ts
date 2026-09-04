import type { Store } from '../storage/database.js';
import type { LLMProvider, StreamChunk, ToolCall } from '../models/types.js';
import type { ModelConfig } from '../config/type.js';
import type { ChatMessage, ChatSession } from './types.js';
import { ContextManager, estimateTokens } from './context.js';
import { providerFor } from '../models/index.js';
import { TimeoutError } from '../error/index.js';
import type { McpRegistry } from '../mcp/registry.js';

function autoTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 36) return clean;
  const cut = clean.slice(0, 36);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 10 ? cut.slice(0, lastSpace) + '…' : cut + '…';
}

const TITLE_SYSTEM_PROMPT =
  'You are a title generator. Given a short conversation, generate a concise title (max 36 characters) that summarizes what the conversation is about. Reply with ONLY the title text — no quotes, no punctuation at the end, no explanation.';

function sanitizeTitle(raw: string): string | null {
  let t = raw.replace(/[\r\n]+/g, ' ').trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (t.length === 0 || t.length > 120) return null;
  if (t.length <= 36) return t;
  const cut = t.slice(0, 36);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 10 ? cut.slice(0, lastSpace) : cut;
}

export interface ChatManagerOptions {
  resume?: boolean;
}

const MAX_TOOL_TURNS = 8;

function parseToolArguments(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

export class ChatManager {
  private store: Store;
  private provider: LLMProvider;
  private config: ModelConfig;
  private models: Record<string, ModelConfig>;
  private modelName: string;
  private current: ChatSession;
  private mcp: McpRegistry | null;

  constructor(
    store: Store,
    provider: LLMProvider,
    config: ModelConfig,
    opts: ChatManagerOptions = {},
    models: Record<string, ModelConfig> = {},
    mcp: McpRegistry | null = null,
  ) {
    this.store = store;
    this.provider = provider;
    this.config = config;
    this.models = models;
    this.mcp = mcp;
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

  setSystemPrompt(id: string, systemPrompt: string): void {
    this.store.setSystemPrompt(id, systemPrompt);
    if (this.current.id === id) {
      this.current = this.store.getChat(id) ?? this.current;
    }
  }

  setChatTags(id: string, tags: string[]): void {
    this.store.setChatTags(id, tags);
    if (this.current.id === id) {
      this.current = this.store.getChat(id) ?? this.current;
    }
  }

  updateMessage(id: string, messageId: string, content: string): void {
    this.store.updateMessage(id, messageId, content);
    if (this.current.id === id) {
      this.current = this.store.getChat(id) ?? this.current;
    }
  }

  deleteMessage(id: string, messageId: string): void {
    this.store.deleteMessage(id, messageId);
    if (this.current.id === id) {
      this.current = this.store.getChat(id) ?? this.current;
    }
  }

  searchChat(id: string, query: string): ChatMessage[] {
    const chat = this.store.getChat(id);
    if (!chat || query.trim().length === 0) return [];
    const q = query.toLowerCase();
    return chat.messages.filter((m) => m.content.toLowerCase().includes(q));
  }

  async generateTitle(id: string): Promise<string | null> {
    const chat = this.store.getChat(id);
    if (!chat) return null;
    const firstUser = chat.messages.find((m) => m.role === 'user');
    const firstAssistant = chat.messages.find((m) => m.role === 'assistant');
    if (!firstUser) return null;

    const context: ChatMessage[] = [
      {
        role: 'user',
        content: firstUser.content,
        timestamp: firstUser.timestamp,
        id: firstUser.id,
      },
    ];
    if (firstAssistant) {
      context.push({
        role: 'assistant',
        content: firstAssistant.content,
        timestamp: firstAssistant.timestamp,
        id: firstAssistant.id,
      });
    }

    try {
      const controller = new AbortController();
      const timeoutMs = this.config.timeout != null ? this.config.timeout * 1000 : 15000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let suggestion = '';
      for await (const chunk of this.provider.sendMessage(
        [
          { role: 'system', content: TITLE_SYSTEM_PROMPT, timestamp: new Date(), id: 'title-system' },
          ...context,
        ],
        this.config,
        controller.signal,
      )) {
        if (chunk.type === 'content' && chunk.content) suggestion += chunk.content;
      }
      clearTimeout(timer);

      const title = sanitizeTitle(suggestion);
      if (title) {
        this.store.renameChat(id, title);
        if (this.current.id === id) {
          this.current = this.store.getChat(id) ?? this.current;
        }
        return title;
      }
    } catch {
      // Background title generation is best-effort: keep the autoTitle fallback.
    }
    return null;
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

  async *send(userMessage: string, externalSignal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const savedUser: ChatMessage = this.store.appendMessage(this.current.id, {
      role: 'user',
      content: userMessage,
      tokens: estimateTokens(userMessage),
    });
    this.current.messages.push(savedUser);

    if (this.current.title === undefined && this.current.messages.length === 1) {
      const title = autoTitle(userMessage);
      this.store.renameChat(this.current.id, title);
      this.current.title = title;
    }

    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort);
    const timeoutMs = this.config.timeout != null ? this.config.timeout * 1000 : undefined;
    const timer =
      timeoutMs != null
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

    const manager = new ContextManager(this.config.max_tokens ?? 8000);
    const tools = this.mcp ? await this.mcp.listTools() : [];
    const toolsForProvider = tools.length > 0 ? tools : undefined;
    const baseContext = manager.buildContext(this.current.messages, this.current.systemPrompt);

    let response = '';
    let interrupted = false;
    try {
      let context = baseContext;
      for (let turn = 0; ; turn++) {
        const calls: ToolCall[] = [];
        let turnContent = '';
        for await (const chunk of this.provider.sendMessage(
          context,
          this.config,
          controller.signal,
          toolsForProvider,
        )) {
          if (chunk.type === 'content' && chunk.content) {
            turnContent += chunk.content;
            response += chunk.content;
            yield chunk;
          } else if (chunk.type === 'tool' && chunk.tool) {
            calls.push(chunk.tool);
          }
        }

        if (calls.length === 0 || !this.mcp || turn >= MAX_TOOL_TURNS || controller.signal.aborted) {
          break;
        }

        const timestamp = new Date();
        const toolResults: ChatMessage[] = [];
        for (const call of calls) {
          const pretty = call.name.replace('__', ' · ');
          yield { type: 'status', status: `Running ${pretty}…` };
          let result: string;
          try {
            result = await this.mcp.callTool(call.name, parseToolArguments(call.arguments));
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          const preview = result.replace(/\s+/g, ' ').trim();
          yield {
            type: 'status',
            status: `${pretty} → ${preview.length > 80 ? preview.slice(0, 80) + '…' : preview}`,
          };
          toolResults.push({
            role: 'tool',
            toolCallId: call.id,
            content: result,
            timestamp,
            id: `tool-${call.id}`,
          });
        }
        context = [
          ...context,
          {
            role: 'assistant',
            content: turnContent,
            toolCalls: calls,
            timestamp,
            id: `assistant-tools-${turn}`,
          },
          ...toolResults,
        ];
      }
    } catch (err) {
      interrupted = true;
      if (timedOut) {
        throw new TimeoutError(
          `${this.config.provider}/${this.config.model} did not respond within ${this.config.timeout}s`,
        );
      }
      if (!externalSignal?.aborted) {
        throw err;
      }
      // User aborted: keep any partial response, do not surface an error.
    } finally {
      if (timer != null) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onAbort);
    }

    if (interrupted && response.length === 0) {
      yield { type: 'done' };
      return;
    }

    if (response.length > 0) {
      const savedAssistant: ChatMessage = this.store.appendMessage(this.current.id, {
        role: 'assistant',
        content: response,
        tokens: estimateTokens(response),
      });
      this.current.messages.push(savedAssistant);
    }
    yield { type: 'done' };
  }
}
