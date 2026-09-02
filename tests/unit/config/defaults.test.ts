import { describe, expect, it } from 'vitest';
import { getDefaults } from '../../../src/config/defaults.js';

describe('getDefaults', () => {
  it('returns default general settings', () => {
    const d = getDefaults();
    expect(d.general.default_model).toBe('claude');
    expect(d.general.theme).toBe('dark');
    expect(d.general.context_strategy).toBe('smart_truncation');
  });

  it('defines all four model entries with sane defaults', () => {
    const d = getDefaults();
    expect(Object.keys(d.models).sort()).toEqual(['claude', 'gemini', 'openai', 'openrouter']);

    for (const entry of Object.values(d.models)) {
      expect(entry.temperature).toBe(0.7);
      expect(entry.max_tokens).toBe(2000);
    }

    expect(d.models.claude).toMatchObject({
      provider: 'anthropic',
      api_key_env: 'ANTHROPIC_API_KEY',
      model: 'claude-3-5-sonnet-latest',
    });
    expect(d.models.openai).toMatchObject({
      provider: 'openai',
      api_key_env: 'OPENAI_API_KEY',
      model: 'gpt-4o',
    });
    expect(d.models.gemini).toMatchObject({
      provider: 'google',
      api_key_env: 'GOOGLE_API_KEY',
      model: 'gemini-1.5-flash',
    });
    expect(d.models.openrouter).toMatchObject({
      provider: 'openrouter',
      api_key_env: 'OPENROUTER_API_KEY',
      model: 'openrouter/auto',
    });
  });

  it('returns an independent deep copy on each call', () => {
    const a = getDefaults();
    a.general.default_model = 'mutated';
    a.models.claude.model = 'mutated-model';
    a.models.gemini.max_tokens = 1;
    const b = getDefaults();
    expect(b.general.default_model).toBe('claude');
    expect(b.models.claude.model).toBe('claude-3-5-sonnet-latest');
    expect(b.models.gemini.max_tokens).toBe(2000);
  });
});