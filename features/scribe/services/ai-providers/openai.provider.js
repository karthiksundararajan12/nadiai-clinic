/**
 * @fileoverview OpenAI provider using the Responses API structured output.
 */

import { SOAPGenerationError } from "../../errors.js";
import { AIProvider } from "./ai-provider.js";

export class OpenAIProvider extends AIProvider {
  /**
   * @param {{ apiKey?: string; model: string }} config
   */
  constructor(config) {
    super();
    this.name = "openai";
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.endpoint = "https://api.openai.com/v1/responses";
  }

  /** @param {import("./ai-provider.js").GenerateStructuredJSONParams} params */
  async generateStructuredJSON(params) {
    if (!this.apiKey) {
      throw new SOAPGenerationError("OPENAI_API_KEY is not configured");
    }

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: params.input,
        temperature: params.temperature,
        max_output_tokens: params.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: params.jsonSchema.name,
            schema: params.jsonSchema.schema,
            strict: params.jsonSchema.strict ?? true,
          },
        },
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new SOAPGenerationError(
        payload?.error?.message || `OpenAI generation failed with ${res.status}`,
        { provider: this.name, status: res.status, type: payload?.error?.type, code: payload?.error?.code },
      );
    }

    const text = extractOutputText(payload);
    if (!text) {
      throw new SOAPGenerationError("OpenAI response did not contain output text", {
        provider: this.name,
        responseId: payload?.id,
      });
    }

    return {
      provider: this.name,
      response: payload,
      text,
      model: payload?.model || this.model,
      usage: payload?.usage ?? null,
    };
  }
}

function extractOutputText(payload) {
  if (payload?.output_text) return payload.output_text;
  const parts = payload?.output?.flatMap((item) => item.content ?? []) ?? [];
  const textPart = parts.find((part) => part.type === "output_text" && part.text);
  return textPart?.text ?? null;
}
