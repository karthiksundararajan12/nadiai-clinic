/**
 * Compare patient names the way duplicate checks do: trim, collapse
 * internal whitespace, and ignore case.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePatientName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function patientNamesMatch(a, b) {
  return normalizePatientName(a) === normalizePatientName(b);
}
