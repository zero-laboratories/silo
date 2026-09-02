import React from 'react';
import { BOLD } from '../styles.js';

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
        <text key={i} fg="cyan" attributes={BOLD}>
          {line}
        </text>
      ))}
    </box>
  );
}