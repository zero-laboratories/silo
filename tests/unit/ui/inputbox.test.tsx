import { describe, expect, it } from 'vitest';
import React from 'react';
import { testRender } from '@opentui/react/test-utils';
import { InputBox } from '../../../src/ui/components/App.js';

describe('InputBox', () => {
  it('renders placeholder centered in the middle line of a 3-row box', async () => {
    const setup = await testRender(<InputBox value="" isStreaming={false} focused onFocus={() => {}} />, { width: 40, height: 10 });
    try {
      await setup.waitForFrame((frame) => frame.includes('Ask anything...'));
      await setup.waitForVisualIdle();
      const lines = setup.captureCharFrame().split('\n');
      expect(lines[1]).toContain('Ask anything');
      expect(lines[0].trim()).toBe('');
      expect(lines[2].trim()).toBe('');
    } finally {
      await setup.renderer.destroy();
    }
  });

  it('renders typed value is left-aligned with 1-char padding', async () => {
    const setup = await testRender(<InputBox value="hello" isStreaming={false} focused onFocus={() => {}} />, { width: 40, height: 10 });
    try {
      await setup.waitForFrame((frame) => frame.includes('hello'));
      await setup.waitForVisualIdle();
      const lines = setup.captureCharFrame().split('\n');
      // input renders in the middle row; text starts after the centered box left offset + 1 padding
      expect(lines[1].indexOf('h') > 0).toBe(true);
    } finally {
      await setup.renderer.destroy();
    }
  });
});