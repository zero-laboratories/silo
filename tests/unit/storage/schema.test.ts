import { describe, expect, it } from 'vitest';
import { SCHEMA } from '../../../src/storage/schema.js';

describe('SCHEMA', () => {
  it('defines the chats table with all required columns', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS chats');
    for (const col of [
      'id TEXT PRIMARY KEY',
      'created_at DATETIME NOT NULL',
      'updated_at DATETIME NOT NULL',
      'model TEXT NOT NULL',
      'provider TEXT NOT NULL',
      'title TEXT',
      'system_prompt TEXT DEFAULT',
      'metadata TEXT',
    ]) {
      expect(SCHEMA).toContain(col);
    }
  });

  it('defines the messages table with a cascading FK', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS messages');
    for (const col of ['id TEXT PRIMARY KEY', 'chat_id TEXT NOT NULL', 'role TEXT NOT NULL', 'content TEXT NOT NULL', 'timestamp DATETIME NOT NULL']) {
      expect(SCHEMA).toContain(col);
    }
    expect(SCHEMA).toContain('FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE');
  });

  it('creates the expected index for lookups', () => {
    expect(SCHEMA).toContain('idx_messages_chat_id');
    expect(SCHEMA).toContain('idx_messages_timestamp');
    expect(SCHEMA).toContain('idx_chats_updated_at');
  });
});