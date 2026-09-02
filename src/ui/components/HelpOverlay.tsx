import React from 'react';
import { Box, Text } from 'ink';

const shortcuts = [
  ['Chat', ''],
  ['', 'Type a message and press Enter to send'],
  ['Ctrl+T', 'Start a new chat'],
  ['Ctrl+S', 'Open sidebar'],
  ['Ctrl+G', 'Open settings'],
  ['Ctrl+C', 'Stop streaming'],
  ['?', 'Show this help'],
  ['', ''],
  ['Sidebar', ''],
  ['↑/↓', 'Navigate conversations'],
  ['Enter', 'Open selected chat'],
  ['d', 'Delete selected chat'],
  ['r', 'Rename selected chat'],
  ['Esc', 'Back to chat'],
  ['', ''],
  ['Settings', ''],
  ['↑/↓', 'Browse models'],
  ['Enter', 'Switch to selected model'],
  ['Esc', 'Back to chat'],
];

export function HelpOverlay() {
  return (
    <Box
      position="absolute"
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        borderStyle="double"
        borderColor="cyan"
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        width={50}
      >
        <Box justifyContent="center">
          <Text color="cyan" bold>
            Keyboard Shortcuts
          </Text>
        </Box>
        <Text> </Text>
        {shortcuts.map(([key, desc], i) => {
          if (!key && !desc) return <Text key={i}> </Text>;
          if (!desc) {
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
              <Text dimColor>{desc}</Text>
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