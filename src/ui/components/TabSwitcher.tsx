import React from 'react';
import { BOLD, color } from '../styles.js';

export type Mode = 'chat' | 'work';

interface TabSwitcherProps {
  mode: Mode;
  onSelect?: (mode: Mode) => void;
}

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'chat', label: 'Chat' },
  { mode: 'work', label: 'Work' },
];

export function TabSwitcher({ mode, onSelect }: TabSwitcherProps) {
  return (
    <box
      width="100%"
      backgroundColor={color.tabBarBg}
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
      height={1}
      marginTop={1}
    >
      {TABS.map((tab) => {
        const active = tab.mode === mode;
        return (
          <box
            key={tab.mode}
            paddingX={3}
            height={1}
            backgroundColor={active ? color.tabActiveBg : undefined}
            onMouseDown={() => onSelect?.(tab.mode)}
          >
            <text fg={active ? color.fg : color.muted} attributes={active ? BOLD : undefined}>
              {tab.label}
            </text>
          </box>
        );
      })}
    </box>
  );
}