import React from 'react';
import { color } from '../styles.js';

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
    <box flexDirection="column">
      {LOGO.map((line, i) => (
        <text key={i} fg={color.fg}>
          {line}
        </text>
      ))}
    </box>
  );
}