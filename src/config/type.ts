export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
  model: string;
  api_key_env?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
}

export interface SiloConfig {
  general: {
    default_model: string;
    theme: string;
    context_strategy?: string;
  };
  models: Record<string, ModelConfig>;
}
