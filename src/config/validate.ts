import type { SiloConfig } from './type.js';
import { SiloError } from '../error/index.js';

const KNOWN_PROVIDERS = ['anthropic', 'claude', 'openai', 'google', 'gemini', 'openrouter'];

export function validateConfig(config: SiloConfig, file: string): void {
  const modelNames = Object.keys(config.models);
  if (modelNames.length === 0) {
    throw new SiloError(
      `config has no [models.*] entries. Add at least one model in ${file}.`,
    );
  }

  if (!config.general.default_model) {
    throw new SiloError(`general.default_model must be set in ${file}.`);
  }
  if (!config.models[config.general.default_model]) {
    throw new SiloError(
      `general.default_model "${config.general.default_model}" does not match any [models.*] section in ${file}.`,
    );
  }

  for (const name of modelNames) {
    const m = config.models[name];
    if (!m.provider) {
      throw new SiloError(`models.${name}: missing "provider" in ${file}.`);
    }
    if (!KNOWN_PROVIDERS.includes(m.provider)) {
      throw new SiloError(
        `models.${name}: unknown provider "${m.provider}". Supported: ${KNOWN_PROVIDERS.join(', ')}.`,
      );
    }
    if (!m.model || m.model.trim().length === 0) {
      throw new SiloError(`models.${name}: missing "model" in ${file}.`);
    }
    if (m.api_key_env !== undefined && m.api_key_env.trim().length === 0) {
      throw new SiloError(`models.${name}: "api_key_env" cannot be empty in ${file}.`);
    }
    if (m.temperature !== undefined) {
      if (typeof m.temperature !== 'number' || Number.isNaN(m.temperature)) {
        throw new SiloError(`models.${name}: "temperature" must be a number in ${file}.`);
      }
      if (m.temperature < 0 || m.temperature > 2) {
        throw new SiloError(
          `models.${name}: "temperature" must be between 0 and 2 in ${file}.`,
        );
      }
    }
    if (m.max_tokens !== undefined) {
      if (typeof m.max_tokens !== 'number' || !Number.isInteger(m.max_tokens) || m.max_tokens <= 0) {
        throw new SiloError(
          `models.${name}: "max_tokens" must be a positive integer in ${file}.`,
        );
      }
    }
    if (m.timeout !== undefined) {
      if (typeof m.timeout !== 'number' || !Number.isFinite(m.timeout) || m.timeout <= 0) {
        throw new SiloError(
          `models.${name}: "timeout" must be a positive number of seconds in ${file}.`,
        );
      }
    }
  }
}