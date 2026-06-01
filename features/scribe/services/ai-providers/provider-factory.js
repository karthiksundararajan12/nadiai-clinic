/**
 * @fileoverview Provider factory for SOAP generation.
 */

import { AI_PROVIDER, SOAP_GENERATION_CONFIG } from "../../constants.js";
import { SOAPGenerationError } from "../../errors.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { OpenAIProvider } from "./openai.provider.js";

export function createSOAPAIProvider(env = process.env) {
  const provider = resolveSOAPProviderName(env);

  if (provider === AI_PROVIDER.ANTHROPIC) {
    return new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_SOAP_MODEL || SOAP_GENERATION_CONFIG.DEFAULT_CLAUDE_MODEL,
    });
  }

  if (provider === AI_PROVIDER.OPENAI) {
    return new OpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_SOAP_MODEL || SOAP_GENERATION_CONFIG.DEFAULT_OPENAI_MODEL,
    });
  }

  throw new SOAPGenerationError(`Unsupported SOAP AI provider: ${provider}`);
}

export function resolveSOAPProviderName(env = process.env) {
  const configured = env.SOAP_AI_PROVIDER || env.AI_SOAP_PROVIDER;
  if (!configured) {
    if (env.ANTHROPIC_API_KEY) return AI_PROVIDER.ANTHROPIC;
    if (env.OPENAI_API_KEY) return AI_PROVIDER.OPENAI;
    return SOAP_GENERATION_CONFIG.DEFAULT_PROVIDER;
  }

  const normalized = String(configured).toLowerCase();

  if (normalized === AI_PROVIDER.ANTHROPIC || normalized === "claude") {
    return AI_PROVIDER.ANTHROPIC;
  }
  if (normalized === AI_PROVIDER.OPENAI) {
    return AI_PROVIDER.OPENAI;
  }

  return normalized;
}
