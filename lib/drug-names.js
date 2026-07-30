/**
 * @fileoverview Client-side loader for the static Indian medicine brand-name
 * list served from `/data/drug-names.json` (see public/data/README.md for
 * source + MIT license attribution).
 *
 * Fetches once per browser session and caches in module memory — safe to call
 * from every medicine row / focus handler without refetching.
 */

/** @type {ReadonlyArray<string>|null} */
let cachedDrugNames = null;

/** @type {Promise<ReadonlyArray<string>>|null} */
let inflight = null;

/**
 * @returns {Promise<ReadonlyArray<string>>}
 */
export function loadDrugNames() {
  if (cachedDrugNames) return Promise.resolve(cachedDrugNames);
  if (inflight) return inflight;

  inflight = fetch("/data/drug-names.json", { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load drug names (${response.status})`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("Drug names payload is not an array");
      }
      const names = Object.freeze(payload.map((entry) => String(entry)));
      cachedDrugNames = names;
      return names;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
}

/** Test helper — clears the in-memory cache between unit tests. */
export function resetDrugNamesCacheForTests() {
  cachedDrugNames = null;
  inflight = null;
}

/**
 * Pure filter used by the drug-name combobox (and tests). Caps results and
 * requires a non-empty query so we never try to render ~250k rows.
 *
 * @param {ReadonlyArray<string>} options
 * @param {string} query
 * @param {{ maxSuggestions?: number }} [opts]
 * @returns {string[]}
 */
export function filterDrugNameSuggestions(options, query, opts = {}) {
  const maxSuggestions = opts.maxSuggestions ?? 75;
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return [];
  const matches = [];
  for (const option of options) {
    if (String(option).toLowerCase().includes(normalized)) {
      matches.push(option);
      if (matches.length >= maxSuggestions) break;
    }
  }
  return matches;
}
