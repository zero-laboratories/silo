import React from 'react';
import { Box, Text } from 'ink';
import type { SiloConfig } from '../../config/type.js';

interface SettingsProps {
  config: SiloConfig;
  currentModel: string;
  selected: number;
}

export function Settings({ config, currentModel, selected }: SettingsProps) {
  const names = Object.keys(config.models);
  return (
    <Box flexDirection="column" width={60} borderStyle="single" borderColor="gray" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          Model Settings
        </Text>
        <Text dimColor>Esc</Text>
      </Box>
      <Text color="green">
        ● Current Model: {currentModel} ({config.models[currentModel]?.provider})
      </Text>
      <Text> </Text>
      <Text color="cyan" bold>
        Configured Models
      </Text>
      {names.length === 0 && <Text dimColor>No models configured.</Text>}
      {names.map((name, i) => {
        const m = config.models[name];
        const detail = [
          m?.provider,
          m?.model,
          m?.temperature !== undefined ? `temp ${m.temperature}` : null,
          m?.max_tokens !== undefined ? `max ${m.max_tokens}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Text key={name} inverse={i === selected} color={name === currentModel ? 'green' : undefined}>
            {name === currentModel ? '●' : ' '} {name}
            {detail ? <Text dimColor>  — {detail}</Text> : null}
          </Text>
        );
      })}
      <Text> </Text>
      <Text dimColor>↑↓ select · Enter switch · ? shortcuts</Text>
    </Box>
  );
}