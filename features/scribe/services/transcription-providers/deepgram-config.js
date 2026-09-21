/**
 * Shared Deepgram model / language mapping for pre-recorded and live APIs.
 */

import { SCRIBE_LANGUAGE } from "../../constants.js";

/** @type {Record<string, string>} SCRIBE_LANGUAGE → Deepgram language code */
export const DEEPGRAM_LANGUAGE_MAP = {
  [SCRIBE_LANGUAGE.ENGLISH]:  "en",
  [SCRIBE_LANGUAGE.HINDI]:    "hi",
  [SCRIBE_LANGUAGE.HINGLISH]: "multi",
};

/** @type {Record<string, string>} SCRIBE_LANGUAGE → best Deepgram model */
export const DEEPGRAM_MODEL_MAP = {
  [SCRIBE_LANGUAGE.ENGLISH]:  "nova-2-medical",
  [SCRIBE_LANGUAGE.HINDI]:    "nova-2",
  [SCRIBE_LANGUAGE.HINGLISH]: "nova-2",
};

export const DEEPGRAM_LISTEN_HTTP_URL = "https://api.deepgram.com/v1/listen";
export const DEEPGRAM_LISTEN_WS_URL = "wss://api.deepgram.com/v1/listen";

/** Cost per minute in US cents for each model class */
export const DEEPGRAM_COST_CENTS_PER_MINUTE = {
  medical: 0.59,
  general: 0.43,
};

export function resolveDeepgramModel(language) {
  return DEEPGRAM_MODEL_MAP[language] ?? (process.env.DEEPGRAM_MODEL ?? "nova-2-medical");
}

export function resolveDeepgramLanguage(language) {
  return DEEPGRAM_LANGUAGE_MAP[language] ?? "en";
}

/** @param {number|null} seconds @param {string} model */
export function estimateDeepgramCostCents(seconds, model) {
  const rate = String(model ?? "").includes("medical")
    ? DEEPGRAM_COST_CENTS_PER_MINUTE.medical
    : DEEPGRAM_COST_CENTS_PER_MINUTE.general;
  return Math.ceil(((seconds ?? 0) / 60) * rate);
}
