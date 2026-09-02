import React, { useMemo } from 'react';
import type { ChatSession } from '../../chat/types.js';
import { BOLD, DIM, INVERSE } from '../styles.js';

export function chatLabel(chat: ChatSession): string {
  if (chat.title) return chat.title;
  const first = chat.messages.find((m) => m.role === 'user');
  if (first) {
    const preview = first.content.slice(0, 40);
    return preview.length < first.content.length ? `${preview}…` : preview;
  }
  return 'New chat';
}

interface SidebarProps {
  chats: ChatSession[];
  activeId: string;
  selected: number;
}

export function Sidebar({ chats, activeId, selected }: SidebarProps) {
  const rows = useMemo(
    () =>
      chats.map((chat) => {
        const tags = chat.tags ?? [];
        return {
          key: chat.id,
          label: chatLabel(chat),
          tagsText: tags.length > 0 ? `  #${tags.join(' #')}` : '',
        };
      }),
    [chats],
  );

  return (
    <box
      flexDirection="column"
      width={34}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <box justifyContent="space-between">
        <text fg="cyan" attributes={BOLD}>
          Conversations
        </text>
        <text attributes={DIM}>Esc</text>
      </box>
      <text> </text>
      {chats.length === 0 && <text attributes={DIM}>No conversations yet.</text>}
      {rows.map((row, i) => {
        const isActive = row.key === activeId;
        const isSelected = i === selected;
        return (
          <text
            key={row.key}
            fg={isSelected ? 'cyan' : isActive ? 'green' : undefined}
            attributes={isSelected ? INVERSE : isActive ? BOLD : undefined}
          >
            {isActive ? '● ' : '  '}
            {row.label}
            {row.tagsText.length > 0 && <span attributes={DIM}>{row.tagsText}</span>}
          </text>
        );
      })}
      <text> </text>
      <text attributes={DIM}>↑↓ nav · Enter open · d del · r rename · t tags · p prompt</text>
    </box>
  );
}