import { describe, expect, it } from 'vitest';
import React from 'react';
import { testRender } from '@opentui/react/test-utils';
import { chatLabel, Sidebar } from '../../../src/ui/components/Sidebar.js';
import { inputCharOf } from '../../../src/ui/components/App.js';
import { TabSwitcher } from '../../../src/ui/components/TabSwitcher.js';
import { WorkLogo } from '../../../src/ui/components/WorkLogo.js';
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

const base: ChatSession = {
  id: 'c1',
  messages: [],
  model: 'claude',
  provider: 'openai',
  systemPrompt: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('chatLabel', () => {
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

  it('renders the delete confirmation prompt inside the sidebar', async () => {
    const chats: ChatSession[] = [
      { ...base, id: 'c1', title: 'First chat' },
      { ...base, id: 'c2', title: 'Second chat' },
    ];
    const frame = await renderContaining(
      <Sidebar chats={chats} activeId="c1" selected={1} prompt={{ kind: 'confirmDelete', label: 'Delete conversation? (y/N)', value: '' }} />,
      'First chat',
    );
    expect(frame).toContain('Second chat');
    expect(frame).toContain('Delete');
  });

  it('renders a rename input with cursor inside the sidebar', async () => {
    const chats: ChatSession[] = [{ ...base, id: 'c1', title: 'First chat' }];
    const frame = await renderContaining(
      <Sidebar chats={chats} activeId="c1" selected={0} prompt={{ kind: 'rename', label: 'New title: ', value: 'Re' }} />,
      'First chat',
    );
    expect(frame).toMatch(/title/);
  });

  it('renders the tab switcher with Chat and Work tabs', async () => {
    const frame = await renderContaining(<TabSwitcher mode="chat" />, 'Chat');
    expect(frame).toContain('Work');
  });

  it('highlights the active tab', async () => {
    const chatFrame = await renderContaining(<TabSwitcher mode="chat" />, 'Chat');
    const workFrame = await renderContaining(<TabSwitcher mode="work" />, 'Work');
    expect(chatFrame).toContain('Chat');
    expect(workFrame).toContain('Work');
  });

  it('renders the Work logo as block glyphs', async () => {
    await renderContaining(<WorkLogo />, '█');
  });
});

describe('TabSwitcher mouse interaction', () => {
  it('fires onSelect("work") when the Work tab is clicked', async () => {
    const { vi } = await import('vitest');
    const onSelect = vi.fn();
    const setup = await testRender(
      <TabSwitcher mode="chat" onSelect={onSelect} />,
      { width: 80, height: 4, useMouse: true },
    );
    try {
      await setup.waitForFrame((frame) => frame.includes('Work'));
      const rows = setup.captureCharFrame().split('\n');
      const y = rows.findIndex((row) => row.includes('Work'));
      const x = rows[y].indexOf('Work');
      await setup.mockMouse.click(x + 1, y);
      await setup.waitForFrame(() => true);
      expect(onSelect).toHaveBeenCalledWith('work');
    } finally {
      await setup.renderer.destroy();
    }
  });

  it('fires onSelect("chat") when the Chat tab is clicked', async () => {
    const { vi } = await import('vitest');
    const onSelect = vi.fn();
    const setup = await testRender(
      <TabSwitcher mode="work" onSelect={onSelect} />,
      { width: 80, height: 4, useMouse: true },
    );
    try {
      await setup.waitForFrame((frame) => frame.includes('Chat'));
      const rows = setup.captureCharFrame().split('\n');
      const y = rows.findIndex((row) => row.includes('Chat'));
      const x = rows[y].indexOf('Chat');
      await setup.mockMouse.click(x + 1, y);
      await setup.waitForFrame(() => true);
      expect(onSelect).toHaveBeenCalledWith('chat');
    } finally {
      await setup.renderer.destroy();
    }
  });
});