import React from 'react';
import { color } from '../styles.js';

const WORK_LOGO = [
  ' ██╗    ██╗  ██████╗  ██████╗  ██╗  ██╗',
  ' ██║    ██║ ██╔═══██╗ ██╔══██╗ ██║ ██╔╝',
  ' ██║ █╗ ██║ ██║   ██║ ██████╔╝ █████╔╝',
  ' ██║███╗██║ ██║   ██║ ██╔══██╗ ██╔═██╗',
  ' ╚███╔███╔╝ ╚██████╔╝ ██║  ██║ ██║  ██╗',
  '  ╚══╝╚══╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝',
];

export function WorkLogo() {
  return (
    <box flexDirection="column">
      {WORK_LOGO.map((line, i) => (
        <text key={i} fg={color.fg}>
          {line}
        </text>
      ))}
    </box>
  );
}