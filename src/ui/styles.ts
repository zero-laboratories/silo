import { createTextAttributes } from '@opentui/core';

export const BOLD = createTextAttributes({ bold: true });
export const DIM = createTextAttributes({ dim: true });
export const INVERSE = createTextAttributes({ inverse: true });
export const BOLD_INVERSE = createTextAttributes({ bold: true, inverse: true });

export const color = {
  primary: '#5896eb',
  accent: '#58d5eb',
  assistant: '#89ce6a',
  success: '#89ce6a',
  warning: '#f5a742',
  prompt: '#a67cd8',
  error: '#ff3a3a',
  muted: '#808080',
  inputBg: '#1e1e1e',
  selectedBg: '#444444',
  fg: '#e8e8e8',
  bg: '#0a0a0a',
} as const;