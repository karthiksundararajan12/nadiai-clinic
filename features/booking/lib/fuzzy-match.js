/**
 * @fileoverview Pure Levenshtein-based fuzzy name matching (no I/O).
 * Used to catch likely-duplicate patient records under the same
 * contact_phone (e.g. "Rohan" vs "Rohan " vs "Rohn" typo) before creating
 * a new patient row.
 */

/**
 * Classic dynamic-programming edit distance.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const insertCost  = currentRow[j] + 1;
      const deleteCost  = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/**
 * Normalized similarity in [0, 1] — 1 means identical (after case/whitespace
 * normalization), 0 means completely different.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function nameSimilarity(a, b) {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

function normalizeForComparison(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds the closest existing-patient match for a newly entered name, if any
 * candidate clears the similarity threshold.
 *
 * @template {{ full_name: string }} T
 * @param {string} name
 * @param {T[]} candidates
 * @param {number} threshold  Similarity in [0, 1] required to count as a match.
 * @returns {{ candidate: T; score: number } | null}
 */
export function findClosestPatientMatch(name, candidates, threshold) {
  let best = null;
  for (const candidate of candidates) {
    const score = nameSimilarity(name, candidate.full_name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}
