import React from 'react';
import type { SiloConfig } from '../../config/type.js';
import { BOLD, DIM, INVERSE } from '../styles.js';

interface SettingsProps {
  config: SiloConfig;
  currentModel: string;
  selected: number;
}

export function Settings({ config, currentModel, selected }: SettingsProps) {
  const names = Object.keys(config.models);
  return (
    <box flexDirection="column" width={60} borderStyle="single" borderColor="gray" paddingX={1}>
      <box justifyContent="space-between">
        <text fg="cyan" attributes={BOLD}>
          Model Settings
        </text>
        <text attributes={DIM}>Esc</text>
      </box>
      <text fg="green" attributes={BOLD}>
        ● Current Model: {currentModel} ({config.models[currentModel]?.provider})
      </text>
      <text> </text>
      <text fg="cyan" attributes={BOLD}>
        Configured Models
      </text>
      {names.length === 0 && <text attributes={DIM}>No models configured.</text>}
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
          <text key={name} fg={name === currentModel ? 'green' : undefined} attributes={i === selected ? INVERSE : undefined}>
            {name === currentModel ? '●' : ' '} {name}
            {detail ? <span attributes={DIM}>  — {detail}</span> : null}
          </text>
        );
      })}
      <text> </text>
      <text attributes={DIM}>↑↓ select · Enter switch · ? shortcuts</text>
    </box>
  );
}