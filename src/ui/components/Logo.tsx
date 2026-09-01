import React from 'react';
import { Box, Text } from 'ink';

const LOGO = [
  ' ███████╗  ██╗ ██╗       ██████╗',
  ' ██╔════╝ ███║ ██║      ██╔═████╗',
  ' ███████╗ ╚██║ ██║      ██║██╔██║',
  ' ╚════██║  ██║ ██║      ████╔╝██║',
  ' ███████║  ██║ ███████╗ ╚██████╔╝',
  ' ╚══════╝  ╚═╝ ╚══════╝  ╚═════╝',
];

export function Logo() {
  return (
    <Box flexDirection="column">
      {LOGO.map((line, i) => (
        <Text key={i} color="cyan">
          {line}
        </Text>
      ))}
    </Box>
  );
}