/**
 * Browser-visible timing / render logs for Scribe pipeline debugging.
 * Prefix is greppable in DevTools and server-forwarded console.
 */

const PREFIX = "[scribe:timing]";

/**
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
export function logScribeTiming(event, meta = {}) {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(PREFIX, event, { t: Date.now(), ...meta });
}
