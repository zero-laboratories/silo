import React, { useMemo } from 'react';
import type { ChatSession } from '../../chat/types.js';
import { BOLD, DIM, color } from '../styles.js';

export function chatLabel(chat: ChatSession): string {
  if (chat.title) return chat.title;
  const first = chat.messages.find((m) => m.role === 'user');
  if (first) {
    const preview = first.content.slice(0, 40);
    return preview.length < first.content.length ? `${preview}…` : preview;
  }
  return 'New chat';
}

export interface SidebarPrompt {
  kind: 'confirmDelete' | 'rename' | 'tag' | 'prompt';
  label: string;
  value: string;
}

interface SidebarProps {
  chats: ChatSession[];
  activeId: string;
  selected: number;
  prompt?: SidebarPrompt;
}

const promptBorderColor = {
  confirmDelete: color.warning,
  rename: color.primary,
  tag: color.prompt,
  prompt: color.success,
} as const;

const promptFgColor = {
  confirmDelete: color.warning,
  rename: color.primary,
  tag: color.prompt,
  prompt: color.success,
} as const;

const PROMPT_TEXT_WIDTH = 28;

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf(' ', maxWidth);
    if (breakAt <= 0) breakAt = maxWidth;
    else breakAt += 1;
    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt);
  }
  return lines;
}

export function Sidebar({ chats, activeId, selected, prompt }: SidebarProps) {
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
      flexGrow={1}
      borderStyle="single"
      borderColor={color.muted}
      paddingX={1}
    >
      <box width="100%" flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={color.primary} attributes={BOLD}>
          Conversations
        </text>
        <text attributes={DIM}>Esc</text>
      </box>
      <text> </text>
      <text attributes={DIM}>↑↓ nav · Enter open · d del · r rename · t tags · p prompt</text>
      {prompt && (
        <box flexDirection="column" borderStyle="single" borderColor={promptBorderColor[prompt.kind]} paddingX={1} marginTop={1} width="100%">
          <box flexShrink={0} width="100%">
            <text fg={promptFgColor[prompt.kind]} attributes={prompt.kind === 'confirmDelete' ? BOLD : undefined}>
              {prompt.label}
            </text>
          </box>
          {prompt.kind !== 'confirmDelete' && (
            prompt.value.length > 0 ? (
              (() => {
                const lines = wrapText(prompt.value, PROMPT_TEXT_WIDTH);
                return lines.map((line, i) => {
                  const isLast = i === lines.length - 1;
                  const maxLine = isLast ? PROMPT_TEXT_WIDTH - 1 : PROMPT_TEXT_WIDTH;
                  const display = line.length > maxLine ? line.slice(0, maxLine) : line;
                  return (
                    <box key={i} flexShrink={0} width="100%">
                      <text>
                        {display}
                        {isLast && <span bg={color.selectedBg}> </span>}
                      </text>
                    </box>
                  );
                });
              })()
            ) : (
              <box flexShrink={0} width="100%">
                <text bg={color.selectedBg}> </text>
              </box>
            )
          )}
        </box>
      )}
      <scrollbox flexGrow={1} scrollY>
        {chats.length === 0 && <text attributes={DIM}>No conversations yet.</text>}
        {rows.map((row, i) => {
          const isActive = row.key === activeId;
          const isSelected = i === selected;
          return (
            <text
              key={row.key}
              fg={isSelected ? color.fg : isActive ? color.success : undefined}
              bg={isSelected ? color.selectedBg : undefined}
              attributes={isActive && !isSelected ? BOLD : undefined}
            >
              {isActive ? '● ' : '  '}
              {row.label}
              {row.tagsText.length > 0 && <span attributes={DIM}>{row.tagsText}</span>}
            </text>
          );
        })}
      </scrollbox>
    </box>
  );
}
