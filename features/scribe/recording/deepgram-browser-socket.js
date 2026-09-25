/**
 * Browser Listen URL and handshake protocols.
 *
 * Deepgram's current docs do not accept the grant JWT as a query parameter.
 * Browsers cannot set Authorization, so the JWT is the `bearer` WebSocket
 * subprotocol (Sec-WebSocket-Protocol). Query params are listen options only.
 *
 * https://developers.deepgram.com/guides/fundamentals/token-based-authentication
 * https://developers.deepgram.com/docs/using-the-sec-websocket-protocol
 */

import {
  DEEPGRAM_LISTEN_WS_URL,
  resolveDeepgramLanguage,
  resolveDeepgramModel,
} from "../services/transcription-providers/deepgram-config.js";

/**
 * @param {string} language Scribe language key (english, hindi, hinglish).
 * @returns {{ url: string, model: string }}
 */
export function deepgramListenUrl(language) {
  const model = resolveDeepgramModel(language);
  const params = new URLSearchParams({
    model,
    language: resolveDeepgramLanguage(language),
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    diarize: "true",
    diarize_model: "latest",
    endpointing: "300",
  });
  return { url: `${DEEPGRAM_LISTEN_WS_URL}?${params}`, model };
}

/**
 * @param {string} accessToken JWT from POST /v1/auth/grant
 * @returns {[string, string]}
 */
export function deepgramBrowserProtocols(accessToken) {
  return ["bearer", accessToken];
}
