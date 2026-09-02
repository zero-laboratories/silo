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
    this.db
      .prepare(
        `INSERT INTO chats (id, created_at, updated_at, model, provider, title, system_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, now, now, chat.model, chat.provider, chat.title ?? null, chat.systemPrompt);
    return {
      id,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      model: chat.model,
      provider: chat.provider,
      systemPrompt: chat.systemPrompt,
      title: chat.title,
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
    return {
      id: row.id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      model: row.model,
      provider: row.provider,
      title: row.title ?? undefined,
      systemPrompt: row.system_prompt,
      messages,
    };
  }
}
