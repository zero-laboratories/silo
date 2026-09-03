import React from 'react';
import { BOLD, DIM, color } from '../styles.js';

const shortcuts: Array<[string, string, boolean]> = [
  ['Chat', '', true],
  ['', 'Type a message and press Enter to send', false],
  ['Ctrl+T', 'Start a new chat', false],
  ['Ctrl+S', 'Open sidebar', false],
  ['Ctrl+G', 'Open settings', false],
  ['Ctrl+F', 'Search current chat', false],
  ['Ctrl+C', 'Stop streaming', false],
  ['Ctrl+X', 'Quit Silo', false],
  ['e', 'Edit / delete a message', false],
  ['?', 'Show this help', false],
  ['Sidebar', '', true],
  ['↑/↓', 'Navigate conversations', false],
  ['Enter', 'Open selected chat', false],
  ['d', 'Delete selected chat', false],
  ['r', 'Rename selected chat', false],
  ['t', 'Edit tags (comma separated)', false],
  ['p', 'Edit system prompt', false],
  ['Esc', 'Back to chat', false],
  ['Settings', '', true],
  ['↑/↓', 'Browse models', false],
  ['Enter', 'Switch to selected model', false],
  ['Esc', 'Back to chat', false],
];

export function HelpOverlay() {
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <box
        borderStyle="double"
        borderColor={color.primary}
        flexDirection="column"
        paddingX={1}
        width={50}
      >
        <box justifyContent="center">
          <text fg={color.primary} attributes={BOLD}>
            Keyboard Shortcuts
          </text>
        </box>
        <text> </text>
        {shortcuts.map(([key, desc, isHeader], i) => {
          if (isHeader) {
            return (
              <text key={i} fg={color.primary} attributes={BOLD}>
                {key}
              </text>
            );
          }
          return (
            <text key={i}>
              <span fg={color.warning} attributes={BOLD}>
                {key.padEnd(10)}
              </span>
              <span>{desc}</span>
            </text>
          );
        })}
        <text> </text>
        <box justifyContent="center">
          <text attributes={DIM}>Press ? or Esc to close</text>
        </box>
      </box>
    </box>
  );
}