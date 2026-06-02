/**
 * @fileoverview Google Gemini provider using generateContent with JSON Schema output.
 *
 * Uses the Gemini REST API (v1beta) with responseMimeType + responseJsonSchema
 * for structured clinical generation. Transient HTTP failures are retried
 * inside the provider; services may apply an additional retry loop.
 */

import { SOAP_GENERATION_CONFIG } from "../../constants.js";
import { SOAPGenerationError } from "../../errors.js";
import { AIProvider } from "./ai-provider.js";

/** HTTP statuses worth retrying (rate limits and upstream errors). */
const RETRIABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

const DEFAULT_MAX_ATTEMPTS = SOAP_GENERATION_CONFIG.MAX_ATTEMPTS;

export class GeminiProvider extends AIProvider {
  /**
   * @param {{
   *   apiKey?: string;
   *   model: string;
   *   maxAttempts?: number;
   *   baseUrl?: string;
   * }} config
   */
  constructor(config) {
    super();
    this.name = "gemini";
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  }

  /** @param {import("./ai-provider.js").GenerateStructuredJSONParams} params */
  async generateStructuredJSON(params) {
    if (!this.apiKey) {
      throw new SOAPGenerationError("GEMINI_API_KEY is not configured");
    }

    const { systemInstruction, contents } = toGeminiMessages(params.input);
    const jsonSchema = prepareGeminiJsonSchema(params.jsonSchema);

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;

    const body = {
      contents,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const payload = await this._requestWithRetry(url, body);
    const text = extractResponseText(payload);

    if (!text) {
      throw new SOAPGenerationError("Gemini response did not contain structured JSON output", {
        provider: this.name,
        model: this.model,
        blockReason: payload?.promptFeedback?.blockReason ?? null,
        finishReason: payload?.candidates?.[0]?.finishReason ?? null,
      });
    }

    return {
      provider: this.name,
      response: payload,
      text,
      model: payload?.modelVersion || this.model,
      usage: payload?.usageMetadata ?? null,
    };
  }

  /**
   * @param {string} url
   * @param {Record<string, unknown>} body
   * @returns {Promise<Record<string, unknown>>}
   */
  async _requestWithRetry(url, body) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const err = new SOAPGenerationError(
            extractGeminiErrorMessage(payload, res.status),
            {
              provider: this.name,
              status: res.status,
              statusText: res.statusText,
              code: payload?.error?.code ?? payload?.error?.status ?? null,
            },
          );

          if (RETRIABLE_HTTP_STATUS.has(res.status) && attempt < this.maxAttempts) {
            lastError = err;
            await sleep(500 * attempt);
            continue;
          }

          throw err;
        }

        const blockReason = payload?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new SOAPGenerationError(`Gemini blocked the request: ${blockReason}`, {
            provider: this.name,
            blockReason,
            safetyRatings: payload?.promptFeedback?.safetyRatings ?? null,
          });
        }

        return payload;
      } catch (err) {
        lastError = err;

        if (err instanceof SOAPGenerationError) {
          if (attempt < this.maxAttempts && isRetriableSoapError(err)) {
            await sleep(500 * attempt);
            continue;
          }
          throw err;
        }

        if (attempt < this.maxAttempts && isRetriableNetworkError(err)) {
          await sleep(500 * attempt);
          continue;
        }

        throw new SOAPGenerationError(
          err instanceof Error ? err.message : "Gemini request failed",
          { provider: this.name, attempt },
        );
      }
    }

    throw lastError ?? new SOAPGenerationError("Gemini generation failed after retries", {
      provider: this.name,
      attempts: this.maxAttempts,
    });
  }
}

/**
 * Converts AIProvider message input into Gemini contents + systemInstruction.
 *
 * @param {Array<{ role: string; content: string }>} input
 */
function toGeminiMessages(input) {
  const systemParts = input
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .filter(Boolean);

  const contents = input
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return {
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : null,
    contents: contents.length > 0
      ? contents
      : [{ role: "user", parts: [{ text: "Generate the requested JSON." }] }],
  };
}

/**
 * Prepares the JSON Schema object for Gemini responseJsonSchema.
 * Strips wrapper fields (name, strict) that belong to the AIProvider contract only.
 *
 * @param {{ name?: string; schema: Record<string, unknown>; strict?: boolean }} jsonSchema
 */
function prepareGeminiJsonSchema(jsonSchema) {
  const schema = jsonSchema?.schema ?? jsonSchema;
  if (!schema || typeof schema !== "object") {
    throw new SOAPGenerationError("Gemini requires a valid JSON schema object", {
      provider: "gemini",
    });
  }
  return structuredClone(schema);
}

/**
 * @param {Record<string, unknown>} payload
 */
function extractResponseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) return null;

  // Normalize to a JSON string for downstream parseAndValidate (same contract as other providers).
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {number} status
 */
function extractGeminiErrorMessage(payload, status) {
  const message =
    payload?.error?.message
    ?? payload?.message
    ?? `Gemini generation failed with ${status}`;
  return String(message);
}

/**
 * @param {SOAPGenerationError} err
 */
function isRetriableSoapError(err) {
  const status = err.details?.status;
  return typeof status === "number" && RETRIABLE_HTTP_STATUS.has(status);
}

/**
 * @param {unknown} err
 */
function isRetriableNetworkError(err) {
  if (!(err instanceof Error)) return false;
  const code = /** @type {{ code?: string }} */ (err).code;
  return code === "ECONNRESET"
    || code === "ETIMEDOUT"
    || code === "ENOTFOUND"
    || code === "EAI_AGAIN"
    || err.name === "AbortError"
    || err.message.includes("fetch failed");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
