/**
 * Pure invoice number formatting — no fs / PDF dependencies.
 * Safe for repositories and any server module that must not pull NFT font assets.
 */

/**
 * Formats a per-clinic sequential sequence into a stable invoice number.
 * @param {number|bigint|string} seq
 * @returns {string}
 */
export function formatInvoiceNumber(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`invoice sequence must be a positive integer, got ${seq}`);
  }
  return `INV-${String(Math.trunc(n)).padStart(6, "0")}`;
}
