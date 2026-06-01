/**
 * Shared formatting utilities for recording components.
 */

/**
 * Formats a byte count into a human-readable string.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0)       return "0 B";
  if (bytes < 1_024)     return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
