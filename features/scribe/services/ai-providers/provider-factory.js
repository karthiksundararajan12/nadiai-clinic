/**
 * @fileoverview Provider factory for SOAP generation.
 */

import { AI_PROVIDER, SOAP_GENERATION_CONFIG } from "../../constants.js";
import { SOAPGenerationError } from "../../errors.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { GeminiProvider } from "./gemini.provider.js";
import { OpenAIProvider } from "./openai.provider.js";

/** @param {NodeJS.ProcessEnv} env @param {string} key */
function envTrim(env, key) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : value;
}

export function createSOAPAIProvider(env = process.env) {
  const provider = resolveSOAPProviderName(env);

  if (provider === AI_PROVIDER.ANTHROPIC) {
    const apiKey = envTrim(env, "ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new SOAPGenerationError(
        "SOAP_AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing. Set the key in .env.local and restart the dev server.",
        { provider },
      );
    }
    return new AnthropicProvider({
      apiKey,
      model: envTrim(env, "CLAUDE_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_CLAUDE_MODEL,
    });
  }

  if (provider === AI_PROVIDER.OPENAI) {
    const apiKey = envTrim(env, "OPENAI_API_KEY");
    if (!apiKey) {
      throw new SOAPGenerationError(
        "SOAP_AI_PROVIDER=openai but OPENAI_API_KEY is missing. Set the key in .env.local and restart the dev server.",
        { provider },
      );
    }
    return new OpenAIProvider({
      apiKey,
      model: envTrim(env, "OPENAI_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_OPENAI_MODEL,
    });
  }

  if (provider === AI_PROVIDER.GEMINI) {
    const apiKey = envTrim(env, "GEMINI_API_KEY");
    if (!apiKey) {
      throw new SOAPGenerationError(
        "SOAP_AI_PROVIDER=gemini but GEMINI_API_KEY is missing (check for typos or leading spaces in .env.local). Restart the dev server after fixing.",
        { provider },
      );
    }
    return new GeminiProvider({
      apiKey,
      model: envTrim(env, "GEMINI_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_GEMINI_MODEL,
    });
  }

  throw new SOAPGenerationError(`Unsupported SOAP AI provider: ${provider}`);
}

export function resolveSOAPProviderName(env = process.env) {
  const configured = envTrim(env, "SOAP_AI_PROVIDER") || envTrim(env, "AI_SOAP_PROVIDER");

  if (!configured) {
    if (envTrim(env, "ANTHROPIC_API_KEY")) return AI_PROVIDER.ANTHROPIC;
    if (envTrim(env, "GEMINI_API_KEY")) return AI_PROVIDER.GEMINI;
    if (envTrim(env, "OPENAI_API_KEY")) return AI_PROVIDER.OPENAI;
    return SOAP_GENERATION_CONFIG.DEFAULT_PROVIDER;
  }

  const normalized = String(configured).toLowerCase();

  if (normalized === AI_PROVIDER.ANTHROPIC || normalized === "claude") {
    return AI_PROVIDER.ANTHROPIC;
  }
  if (normalized === AI_PROVIDER.OPENAI) {
    return AI_PROVIDER.OPENAI;
  }
  if (normalized === AI_PROVIDER.GEMINI || normalized === "google") {
    return AI_PROVIDER.GEMINI;
  }

  return normalized;
}

/**
 * Returns the active provider + model for logging and error messages.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function describeActiveSOAPAIProvider(env = process.env) {
  const provider = resolveSOAPProviderName(env);
  if (provider === AI_PROVIDER.GEMINI) {
    return {
      provider,
      model: envTrim(env, "GEMINI_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_GEMINI_MODEL,
    };
  }
  if (provider === AI_PROVIDER.ANTHROPIC) {
    return {
      provider,
      model: envTrim(env, "CLAUDE_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_CLAUDE_MODEL,
    };
  }
  if (provider === AI_PROVIDER.OPENAI) {
    return {
      provider,
      model: envTrim(env, "OPENAI_SOAP_MODEL") || SOAP_GENERATION_CONFIG.DEFAULT_OPENAI_MODEL,
    };
  }
  return { provider, model: null };
}
