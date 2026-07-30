/**
 * @fileoverview Pure helpers for combobox suggestion filtering.
 * Kept separate from the React component so unit tests can cover capping /
 * empty-query behavior without a DOM harness.
 */

/**
 * @param {ReadonlyArray<string>} options
 * @param {string} query
 * @param {{
 *   maxSuggestions?: number;
 *   showAllOnEmpty?: boolean;
 * }} [opts]
 * @returns {string[]}
 */
export function filterComboboxOptions(options, query, opts = {}) {
  const maxSuggestions = opts.maxSuggestions ?? Number.POSITIVE_INFINITY;
  const showAllOnEmpty = opts.showAllOnEmpty ?? true;
  const normalized = String(query ?? "").trim().toLowerCase();

  if (!normalized) {
    if (!showAllOnEmpty) return [];
    if (Number.isFinite(maxSuggestions)) {
      return options.slice(0, maxSuggestions);
    }
    return [...options];
  }

  const matches = [];
  for (const option of options) {
    if (String(option).toLowerCase().includes(normalized)) {
      matches.push(option);
      if (matches.length >= maxSuggestions) break;
    }
  }
  return matches;
}
