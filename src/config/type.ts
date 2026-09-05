export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
  model: string;
  api_key_env?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface WebSearchConfig {
  enabled?: boolean;
  max_results?: number;
  region?: string;
  safesearch?: number;
}

export interface AgentConfig {
  skills?: boolean;
  context_files?: boolean;
}

export interface SiloConfig {
  general: {
    default_model: string;
    theme: string;
    context_strategy?: string;
  };
  models: Record<string, ModelConfig>;
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
  web_search?: WebSearchConfig;
  agent?: AgentConfig;
}
