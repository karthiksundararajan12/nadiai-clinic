/**
 * @fileoverview Classifies diarized transcript turns as clinically relevant
 * before SOAP generation. Fail-open: never block SOAP if classification fails.
 */

import { TRANSCRIPT_RELEVANCE_CONFIG } from "../constants.js";
import { createLogger } from "../logger.js";
import { GeminiProvider } from "./ai-providers/gemini.provider.js";

export const TRANSCRIPT_RELEVANCE_JSON_SCHEMA = {
  name: "nadi_ai_transcript_relevance",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["turns"],
    properties: {
      turns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "clinical"],
          properties: {
            id: { type: "string" },
            clinical: { type: "boolean" },
          },
        },
      },
    },
  },
  strict: true,
};

const parseLog = createLogger({ component: "TranscriptRelevanceClassifier.parseAndValidate" });

/**
 * @param {Array<{ id: string; speaker_label?: string; speaker?: string; text?: string }>} turns
 */
export function buildRelevancePrompt(turns) {
  const catalog = (turns ?? []).map((turn, index) => ({
    index,
    id: turn.id,
    speaker: turn.speaker_label ?? turn.speaker ?? "Speaker",
    text: turn.text ?? "",
  }));

  return [
    {
      role: "system",
      content: [
        "You classify outpatient consultation transcript turns for SOAP documentation.",
        "Mark clinical=true only when the turn contains care-relevant content: symptoms, history, exam findings, diagnosis, medicines, advice, or follow-up.",
        "Mark clinical=false for small talk, personal or family chatter, jokes, billing/payment talk, and anything unrelated to this patient's care.",
        "Do not infer unstated clinical facts. Classify only the given turns.",
        "Return JSON matching the schema. Include every input id exactly once.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Classify each turn:",
        JSON.stringify(catalog, null, 2),
      ].join("\n"),
    },
  ];
}

/**
 * @param {unknown[]} turns
 * @returns {Array<{ id: string; clinical: boolean }>}
 */
export function failOpenClassifications(turns) {
  return (turns ?? [])
    .filter((turn) => turn && typeof turn.id === "string" && turn.id.length > 0)
    .map((turn) => ({ id: turn.id, clinical: true }));
}

/**
 * Truncation-aware parse, matching prescription parseAndValidateDraft:
 * JSON.parse, detect truncated output, then validate shape against input turns.
 *
 * @param {string} text
 * @param {Array<{ id: string }>} turns
 * @returns {Array<{ id: string; clinical: boolean }>}
 */
export function parseAndValidateRelevance(text, turns) {
  const expected = failOpenClassifications(turns);
  const raw = typeof text === "string" ? text : String(text ?? "");
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const trimmed = raw.trimEnd();
    const looksTruncated = trimmed.length > 0 && !trimmed.endsWith("}");
    parseLog.error("Transcript relevance JSON.parse failed", {
      rawOutputLength: raw.length,
      looksTruncated,
      parseError: err instanceof Error ? err.message : String(err),
    });
    const error = new Error("invalid_json");
    error.looksTruncated = looksTruncated;
    error.rawOutputLength = raw.length;
    throw error;
  }

  const items = Array.isArray(parsed) ? parsed : parsed?.turns;
  if (!Array.isArray(items) || items.length !== expected.length) {
    const error = new Error("validation_failed");
    error.reason = "turn_count_mismatch";
    throw error;
  }

  const byId = new Map();
  for (const item of items) {
    if (typeof item?.id !== "string" || typeof item?.clinical !== "boolean") {
      const error = new Error("validation_failed");
      error.reason = "invalid_item";
      throw error;
    }
    byId.set(item.id, item.clinical);
  }

  for (const turn of expected) {
    if (!byId.has(turn.id)) {
      const error = new Error("validation_failed");
      error.reason = "missing_id";
      throw error;
    }
  }

  return expected.map((turn) => ({
    id: turn.id,
    clinical: byId.get(turn.id) === true,
  }));
}

/** @param {NodeJS.ProcessEnv} [env] */
export function createClassifierAIProvider(env = process.env) {
  const apiKey = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (!apiKey) return null;
  const model =
    (typeof env.GEMINI_CLASSIFIER_MODEL === "string" && env.GEMINI_CLASSIFIER_MODEL.trim())
    || TRANSCRIPT_RELEVANCE_CONFIG.DEFAULT_GEMINI_MODEL;
  return new GeminiProvider({
    apiKey,
    model,
    maxAttempts: TRANSCRIPT_RELEVANCE_CONFIG.MAX_ATTEMPTS,
  });
}

export class TranscriptRelevanceClassifier {
  /**
   * @param {{
   *   aiProvider?: { generateStructuredJSON: Function }|null;
   *   log?: ReturnType<typeof createLogger>;
   * }} [options]
   */
  constructor(options = {}) {
    this._ai = options.aiProvider === undefined
      ? createClassifierAIProvider()
      : options.aiProvider;
    this._log = options.log ?? createLogger({ component: "TranscriptRelevanceClassifier" });
  }

  /**
   * @param {Array<{ id: string; speaker_label?: string; speaker?: string; text?: string }>} turns
   * @returns {Promise<Array<{ id: string; clinical: boolean }>>}
   */
  async classify(turns) {
    const list = Array.isArray(turns) ? turns.filter((turn) => turn?.id) : [];
    if (list.length === 0) return [];

    if (!this._ai?.generateStructuredJSON) {
      this._log.warn("Transcript relevance classifier unavailable; treating all turns as clinical", {
        turnCount: list.length,
      });
      return failOpenClassifications(list);
    }

    try {
      const generated = await this._ai.generateStructuredJSON({
        input: buildRelevancePrompt(list),
        jsonSchema: TRANSCRIPT_RELEVANCE_JSON_SCHEMA,
        temperature: TRANSCRIPT_RELEVANCE_CONFIG.TEMPERATURE,
        maxOutputTokens: TRANSCRIPT_RELEVANCE_CONFIG.MAX_OUTPUT_TOKENS,
      });
      return parseAndValidateRelevance(generated?.text, list);
    } catch (err) {
      this._log.warn("Transcript relevance classification failed; treating all turns as clinical", {
        error: err instanceof Error ? err.message : String(err),
        turnCount: list.length,
        looksTruncated: err && typeof err === "object" ? err.looksTruncated ?? null : null,
      });
      return failOpenClassifications(list);
    }
  }
}
