import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ChatSession } from '../../chat/types.js';

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
    <Box
      flexDirection="column"
      width={34}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          Conversations
        </Text>
        <Text dimColor>Esc</Text>
      </Box>
      <Text> </Text>
      {chats.length === 0 && <Text dimColor>No conversations yet.</Text>}
      {rows.map((row, i) => {
        const isActive = row.key === activeId;
        const isSelected = i === selected;
        return (
          <Text
            key={row.key}
            color={isSelected ? 'cyan' : isActive ? 'green' : undefined}
            bold={isActive}
            inverse={isSelected}
          >
            {isActive ? '● ' : '  '}
            {row.label}
            {row.tagsText.length > 0 && <Text dimColor>{row.tagsText}</Text>}
          </Text>
        );
      })}
      <Text> </Text>
      <Text dimColor>↑↓ nav · Enter open · d del · r rename · t tags · p prompt</Text>
    </Box>
  );
}