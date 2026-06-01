/**
 * @fileoverview Anthropic Claude provider using Messages API tool schema.
 */

import { SOAPGenerationError } from "../../errors.js";
import { AIProvider } from "./ai-provider.js";

export class AnthropicProvider extends AIProvider {
  /**
   * @param {{ apiKey?: string; model: string }} config
   */
  constructor(config) {
    super();
    this.name = "anthropic";
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.endpoint = "https://api.anthropic.com/v1/messages";
  }

  /** @param {import("./ai-provider.js").GenerateStructuredJSONParams} params */
  async generateStructuredJSON(params) {
    if (!this.apiKey) {
      throw new SOAPGenerationError("ANTHROPIC_API_KEY is not configured");
    }

    const { system, messages } = toAnthropicMessages(params.input);
    const toolName = params.jsonSchema.name || "structured_output";

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxOutputTokens,
        temperature: params.temperature,
        system,
        messages,
        tools: [
          {
            name: toolName,
            description: "Return the structured clinical JSON object.",
            input_schema: params.jsonSchema.schema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new SOAPGenerationError(
        payload?.error?.message || `Anthropic generation failed with ${res.status}`,
        { provider: this.name, status: res.status, type: payload?.error?.type },
      );
    }

    const toolUse = payload?.content?.find(
      (item) => item.type === "tool_use" && item.name === toolName,
    );
    if (!toolUse?.input) {
      throw new SOAPGenerationError("Anthropic response did not contain structured tool output", {
        provider: this.name,
        responseId: payload?.id,
      });
    }

    return {
      provider: this.name,
      response: payload,
      text: JSON.stringify(toolUse.input),
      model: payload?.model || this.model,
      usage: payload?.usage ?? null,
    };
  }
}

function toAnthropicMessages(input) {
  const system = input
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const messages = input
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  return {
    system,
    messages: messages.length > 0 ? messages : [{ role: "user", content: "Generate the requested JSON." }],
  };
}
