import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SCHEMA } from './schema.js';
import { dbPath } from '../config/index.js';
import type { ChatMessage, ChatSession } from '../chat/types.js';

type ChatRow = {
  id: string;
  created_at: string;
  updated_at: string;
  model: string;
  provider: string;
  title: string | null;
  system_prompt: string;
  metadata: string | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  estimated_tokens: number | null;
};

export class Store {
  private db: Database.Database;

  constructor(path?: string) {
    const dbFile = path ?? dbPath();
    mkdirSync(dirname(dbFile), { recursive: true });
    this.db = new Database(dbFile);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  createChat(chat: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt' | 'messages'>): ChatSession {
    const id = randomUUID();
    const now = new Date().toISOString();
    const metadata = JSON.stringify({ tags: chat.tags ?? [] });
    this.db
      .prepare(
        `INSERT INTO chats (id, created_at, updated_at, model, provider, title, system_prompt, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, now, now, chat.model, chat.provider, chat.title ?? null, chat.systemPrompt, metadata);
    return {
      id,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      model: chat.model,
      provider: chat.provider,
      systemPrompt: chat.systemPrompt,
      title: chat.title,
      tags: chat.tags ?? [],
      messages: [],
    };
  }

  listChats(): ChatSession[] {
    const rows = this.db
      .prepare('SELECT * FROM chats ORDER BY updated_at DESC')
      .all() as ChatRow[];
    return rows.map((r) => this.toSession(r));
  }

  getChat(id: string): ChatSession | null {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as
      | ChatRow
      | undefined;
    if (!row) return null;
    return this.toSession(row);
  }

  appendMessage(chatId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const msg: ChatMessage = {
      ...message,
      id: randomUUID(),
      timestamp: new Date(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, chat_id, role, content, timestamp, estimated_tokens)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        msg.id,
        chatId,
        msg.role,
        msg.content,
        msg.timestamp.toISOString(),
        msg.tokens ?? null,
      );
    this.db
      .prepare('UPDATE chats SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), chatId);
    return msg;
  }

  deleteChat(id: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  }

  renameChat(id: string, title: string): void {
    this.db
      .prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?')
      .run(title.length > 0 ? title : null, new Date().toISOString(), id);
  }

  setSystemPrompt(id: string, systemPrompt: string): void {
    this.db
      .prepare('UPDATE chats SET system_prompt = ?, updated_at = ? WHERE id = ?')
      .run(systemPrompt, new Date().toISOString(), id);
  }

  setChatTags(id: string, tags: string[]): void {
    this.db
      .prepare('UPDATE chats SET metadata = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ tags }), new Date().toISOString(), id);
  }

  updateMessage(chatId: string, messageId: string, content: string): void {
    this.db
      .prepare('UPDATE messages SET content = ?, estimated_tokens = ? WHERE id = ? AND chat_id = ?')
      .run(content, Math.ceil(content.length / 4), messageId, chatId);
  }

  deleteMessage(chatId: string, messageId: string): void {
    this.db.prepare('DELETE FROM messages WHERE id = ? AND chat_id = ?').run(messageId, chatId);
  }

  private toSession(row: ChatRow): ChatSession {
    const messageRows = this.db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC')
      .all(row.id) as MessageRow[];
    const messages = messageRows.map<ChatMessage>((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      tokens: m.estimated_tokens ?? undefined,
    }));
    let tags: string[] = [];
    try {
      const meta = row.metadata ? (JSON.parse(row.metadata) as { tags?: string[] }) : {};
      tags = Array.isArray(meta.tags) ? meta.tags : [];
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      model: row.model,
      provider: row.provider,
      title: row.title ?? undefined,
      systemPrompt: row.system_prompt,
      tags,
      messages,
    };
  }
}
