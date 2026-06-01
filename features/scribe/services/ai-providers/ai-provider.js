/**
 * @fileoverview AIProvider contract for structured clinical generation.
 *
 * Business services depend on this interface, not vendor SDKs or APIs. New
 * providers should implement generateStructuredJSON and return the normalized
 * shape below.
 */

/**
 * @typedef {{
 *   input: Array<{ role: "system"|"user"|"assistant"; content: string }>;
 *   jsonSchema: {
 *     name: string;
 *     schema: Record<string, unknown>;
 *     strict?: boolean;
 *   };
 *   temperature?: number;
 *   maxOutputTokens?: number;
 * }} GenerateStructuredJSONParams
 */

/**
 * @typedef {{
 *   provider: string;
 *   model: string;
 *   text: string;
 *   response: Record<string, unknown>;
 *   usage: Record<string, unknown>|null;
 * }} AIProviderResult
 */

export class AIProvider {
  /** @type {string} */
  name = "base";

  /** @type {string} */
  model = "";

  /**
   * @param {GenerateStructuredJSONParams} _params
   * @returns {Promise<AIProviderResult>}
   */
  async generateStructuredJSON(_params) {
    throw new Error("AIProvider.generateStructuredJSON must be implemented");
  }
}
