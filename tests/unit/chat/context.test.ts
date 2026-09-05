import { describe, expect, it } from 'vitest';
import { ContextManager, estimateTokens } from '../../../src/chat/context.js';
import type { ChatMessage } from '../../../src/chat/types.js';

function msg(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id: Math.random().toString(36), role, content, timestamp: new Date() };
}

describe('estimateTokens', () => {
  it('approximates ~4 chars per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('ContextManager', () => {
  it('includes the system prompt first', () => {
    const manager = new ContextManager(1000);
    const context = manager.buildContext(
      [msg('hello')],
      'You are a helpful assistant.',
    );
    expect(context[0].role).toBe('system');
    expect(context[0].content).toBe('You are a helpful assistant.');
  });

  it('supports multiple system messages (e.g. context files)', () => {
    const manager = new ContextManager(1000);
    const context = manager.buildContext([msg('hi')], [
      'You are a helpful assistant.',
      '## AGENTS.md instructions',
    ]);
    expect(context.filter((m) => m.role === 'system')).toHaveLength(2);
    expect(context[0].content).toBe('You are a helpful assistant.');
    expect(context[1].content).toBe('## AGENTS.md instructions');
  });

  it('skips empty system parts', () => {
    const manager = new ContextManager(1000);
    const context = manager.buildContext([msg('hi')], ['', 'Only this one.']);
    expect(context.filter((m) => m.role === 'system')).toHaveLength(1);
    expect(context[0].content).toBe('Only this one.');
  });

  it('keeps messages within the token budget', () => {
    const manager = new ContextManager(100);
    const messages = Array.from({ length: 20 }, (_, i) => msg(`message ${i} `));
    const context = manager.buildContext(messages, '');
    const total = context.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    expect(total).toBeLessThanOrEqual(100);
    expect(context.some((m) => m.content.includes('truncated'))).toBe(true);
  });

  it('does not truncate when everything fits', () => {
    const manager = new ContextManager(1000);
    const messages = [msg('short', 'user'), msg('also short', 'assistant')];
    const context = manager.buildContext(messages, '');
    expect(context).toHaveLength(2);
  });
});
