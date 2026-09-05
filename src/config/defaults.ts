import type { SiloConfig } from './type.js';

const defaultConfig: SiloConfig = {
  general: {
    default_model: 'claude',
    theme: 'dark',
    context_strategy: 'smart_truncation',
  },
  models: {
    claude: {
      provider: 'anthropic',
      api_key_env: 'ANTHROPIC_API_KEY',
      model: 'claude-3-5-sonnet-latest',
      temperature: 0.7,
      max_tokens: 2000,
    },
    openai: {
      provider: 'openai',
      api_key_env: 'OPENAI_API_KEY',
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 2000,
    },
    gemini: {
      provider: 'google',
      api_key_env: 'GOOGLE_API_KEY',
      model: 'gemini-1.5-flash',
      temperature: 0.7,
      max_tokens: 2000,
    },
    openrouter: {
      provider: 'openrouter',
      api_key_env: 'OPENROUTER_API_KEY',
      model: 'openrouter/auto',
      temperature: 0.7,
      max_tokens: 2000,
    },
  },
  agent: {
    skills: true,
    context_files: true,
  },
};

export function getDefaults(): SiloConfig {
  return JSON.parse(JSON.stringify(defaultConfig));
}
