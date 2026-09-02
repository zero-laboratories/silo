import React from 'react';
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
  return (
    <Box
      flexDirection="column"
      width={34}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Text color="cyan" bold>
        Conversations
      </Text>
      <Text> </Text>
      {chats.length === 0 && <Text dimColor>No conversations yet.</Text>}
      {chats.map((chat, i) => {
        const isActive = chat.id === activeId;
        const isSelected = i === selected;
        return (
          <Text
            key={chat.id}
            color={isSelected ? 'cyan' : isActive ? 'green' : undefined}
            bold={isActive}
            inverse={isSelected}
          >
            {isActive ? '● ' : '  '}
            {chatLabel(chat)}
          </Text>
        );
      })}
      <Text> </Text>
      <Text dimColor>↑/↓ navigate · Enter open · Ctrl+T new · Esc back</Text>
    </Box>
  );
}