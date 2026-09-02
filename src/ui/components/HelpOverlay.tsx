import React from 'react';
import { Box, Text } from 'ink';

const shortcuts: Array<[string, string, boolean]> = [
  ['Chat', '', true],
  ['', 'Type a message and press Enter to send', false],
  ['Ctrl+T', 'Start a new chat', false],
  ['Ctrl+S', 'Open sidebar', false],
  ['Ctrl+G', 'Open settings', false],
  ['Ctrl+F', 'Search current chat', false],
  ['Ctrl+C', 'Stop streaming', false],
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
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Box
        borderStyle="double"
        borderColor="cyan"
        flexDirection="column"
        paddingX={1}
        width={50}
      >
        <Box justifyContent="center">
          <Text color="cyan" bold>
            Keyboard Shortcuts
          </Text>
        </Box>
        <Text> </Text>
        {shortcuts.map(([key, desc, isHeader], i) => {
          if (isHeader) {
            return (
              <Text key={i} color="cyan" bold>
                {key}
              </Text>
            );
          }
          return (
            <Text key={i}>
              <Text color="yellow" bold>
                {key.padEnd(10)}
              </Text>
              <Text>{desc}</Text>
            </Text>
          );
        })}
        <Text> </Text>
        <Box justifyContent="center">
          <Text dimColor>Press ? or Esc to close</Text>
        </Box>
      </Box>
    </Box>
  );
}