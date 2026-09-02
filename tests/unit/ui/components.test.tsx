import { describe, expect, it } from 'vitest';
import React from 'react';
import { testRender } from '@opentui/react/test-utils';
import { chatLabel } from '../../../src/ui/components/Sidebar.js';
import { inputCharOf } from '../../../src/ui/components/App.js';
import { Logo } from '../../../src/ui/components/Logo.js';
import { HelpOverlay } from '../../../src/ui/components/HelpOverlay.js';
import type { ChatSession } from '../../../src/chat/types.js';
import type { ParsedKey } from '@opentui/core';

async function renderContaining(node: React.ReactNode, expected: string): Promise<string> {
  const setup = await testRender(node, {});
  try {
    return await setup.waitForFrame((frame) => frame.includes(expected));
  } finally {
    await setup.renderer.destroy();
  }
}

describe('chatLabel', () => {
  const base: ChatSession = {
    id: 'c1',
    messages: [],
    model: 'claude',
    provider: 'openai',
    systemPrompt: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('uses the title when present', () => {
    expect(chatLabel({ ...base, title: 'My chat' })).toBe('My chat');
  });

  it('falls back to first user message preview', () => {
    expect(
      chatLabel({
        ...base,
        messages: [{ id: 'm1', role: 'user', content: 'Hello world', timestamp: new Date() }],
      }),
    ).toBe('Hello world');
  });

  it('truncates long user messages with an ellipsis', () => {
    const long = 'x'.repeat(100);
    expect(chatLabel({ ...base, messages: [{ id: 'm1', role: 'user', content: long, timestamp: new Date() }] })).toBe(
      `${'x'.repeat(40)}…`,
    );
  });

  it('defaults to "New chat" when empty and untitled', () => {
    expect(chatLabel(base)).toBe('New chat');
  });
});

describe('inputCharOf', () => {
  function key(partial: Partial<Pick<ParsedKey, 'name' | 'sequence'>>) {
    return {
      name: 'x',
      sequence: '',
      ...partial,
    };
  }

  it('returns the sequence for single-character keys', () => {
    expect(inputCharOf(key({ name: 'h', sequence: 'h' }))).toBe('h');
    expect(inputCharOf(key({ name: 'y', sequence: 'Y' }))).toBe('Y');
    expect(inputCharOf(key({ name: ' ', sequence: ' ' }))).toBe(' ');
  });

  it('returns empty string for named keys', () => {
    expect(inputCharOf(key({ name: 'return', sequence: '\r' }))).toBe('');
    expect(inputCharOf(key({ name: 'up', sequence: '\u001b[A' }))).toBe('');
    expect(inputCharOf(key({ name: 'backspace', sequence: '\u0008' }))).toBe('');
    expect(inputCharOf(key({ name: 'escape', sequence: '\u001b' }))).toBe('');
  });

  it('uses name length (not sequence) to decide printable status', () => {
    expect(inputCharOf(key({ name: 'c', sequence: '\u0003' }))).toBe('\u0003');
  });
});

describe('component rendering (OpenTUI)', () => {
  it('renders the Logo as block glyphs', async () => {
    await renderContaining(<Logo />, '█');
  });

  it('renders the HelpOverlay with shortcut list', async () => {
    const frame = await renderContaining(<HelpOverlay />, 'Ctrl+T');
    expect(frame).toContain('Ctrl+X');
    expect(frame).toContain('Quit Silo');
    expect(frame).toContain('Rename selected chat');
  });
});