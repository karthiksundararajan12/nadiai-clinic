/**
 * Pure prescription number formatting — no fs / PDF dependencies.
 * Safe for repositories and any server module that must not pull NFT font assets.
 */

/**
 * Formats a per-clinic sequential sequence into a stable Rx number.
 * @param {number|bigint|string} seq
 * @returns {string}
 */
export function formatPrescriptionNumber(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`prescription sequence must be a positive integer, got ${seq}`);
  }
  return `RX-${String(Math.trunc(n)).padStart(6, "0")}`;
}
