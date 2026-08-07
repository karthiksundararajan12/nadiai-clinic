/**
 * Range-aware helpers for prescription dose / duration / frequency fields.
 *
 * Preserves values like "3-4 days" or "1-2 tablets" as distinct chip options
 * instead of collapsing them to a single preset.
 */

/** @typedef {{ value: string; label: string; kind: "preset" | "range" | "current" | "custom" }} FieldChipOption */

export const PRESCRIPTION_FREQUENCY_OPTIONS = Object.freeze([
  "1-0-1",
  "1-1-1",
  "1-0-0",
  "0-0-1",
  "OD",
  "BD",
  "TDS",
  "QID",
  "SOS",
]);

export const PRESCRIPTION_DURATION_PRESETS = Object.freeze([
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "2 weeks",
]);

/** Common dose chips when medicine-specific suggestions are unavailable. */
export const PRESCRIPTION_DOSE_PRESETS = Object.freeze([
  "250mg",
  "500mg",
  "650mg",
  "1g",
  "5ml",
  "10ml",
  "1 tablet",
  "2 tablets",
]);

const CUSTOM_CHIP_VALUE = "__custom__";

/**
 * Detects dose/duration range strings such as "3-4 days", "1–2 tablets".
 * Intentionally ignores dosage patterns like "1-0-1" (frequency).
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isRangeValue(value) {
  const text = normalizeFieldValue(value);
  if (!text) return false;
  // Frequency patterns (morning-afternoon-night) are not ranges.
  if (/^\d-\d-\d$/.test(text)) return false;
  // e.g. "3-4 days", "1-2", "500-650mg", "1 – 2 tablets"
  return /\d+\s*[-–—]\s*\d+/.test(text);
}

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeFieldValue(value) {
  return String(value ?? "").trim();
}

/**
 * Case-insensitive compare that collapses whitespace and hyphen variants.
 *
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
export function fieldValuesEqual(a, b) {
  const left = normalizeFieldValue(a).toLowerCase().replace(/\s+/g, " ").replace(/[–—]/g, "-");
  const right = normalizeFieldValue(b).toLowerCase().replace(/\s+/g, " ").replace(/[–—]/g, "-");
  return left === right;
}

/**
 * Whether the current value matches one of the preset chips (not custom/range-only).
 *
 * @param {string|null|undefined} value
 * @param {ReadonlyArray<string>} presets
 * @returns {boolean}
 */
export function isPresetValue(value, presets) {
  const text = normalizeFieldValue(value);
  if (!text) return false;
  return presets.some((preset) => fieldValuesEqual(preset, text));
}

/**
 * Build chip options for a field. Preserves range / non-preset current values
 * as a distinct selectable chip so they are never force-collapsed.
 *
 * @param {object} input
 * @param {string|null|undefined} input.currentValue
 * @param {ReadonlyArray<string>} input.presets
 * @param {boolean} [input.includeCustom=true]
 * @returns {FieldChipOption[]}
 */
export function buildFieldChipOptions({ currentValue, presets, includeCustom = true }) {
  const current = normalizeFieldValue(currentValue);
  /** @type {FieldChipOption[]} */
  const options = presets.map((preset) => ({
    value: preset,
    label: preset,
    kind: "preset",
  }));

  const matchesPreset = current ? isPresetValue(current, presets) : false;
  if (current && !matchesPreset && current !== "Not specified") {
    options.unshift({
      value: current,
      label: current,
      kind: isRangeValue(current) ? "range" : "current",
    });
  }

  if (includeCustom) {
    options.push({
      value: CUSTOM_CHIP_VALUE,
      label: "Custom",
      kind: "custom",
    });
  }

  return options;
}

/**
 * Resolve which chip is selected for the current draft value.
 * Returns CUSTOM_CHIP_VALUE when the doctor is entering a custom value
 * that is not yet committed, or when `customMode` is forced open.
 *
 * @param {object} input
 * @param {string|null|undefined} input.currentValue
 * @param {ReadonlyArray<string>} input.presets
 * @param {boolean} [input.customMode=false]
 * @returns {string}
 */
export function resolveSelectedChipValue({ currentValue, presets, customMode = false }) {
  if (customMode) return CUSTOM_CHIP_VALUE;
  const current = normalizeFieldValue(currentValue);
  if (!current || current === "Not specified") return "";
  if (isPresetValue(current, presets)) {
    const match = presets.find((preset) => fieldValuesEqual(preset, current));
    return match ?? current;
  }
  // Range / free-text current value is its own chip.
  return current;
}

/**
 * Apply a chip tap to draft state.
 * Tapping the already-selected preset does not clear the value (keep draft stable).
 * Tapping Custom opens custom mode without wiping the prior value until typed.
 *
 * @param {object} input
 * @param {string|null|undefined} input.currentValue
 * @param {string} input.chipValue
 * @param {ReadonlyArray<string>} input.presets
 * @param {boolean} [input.customMode]
 * @returns {{ value: string; customMode: boolean }}
 */
export function selectFieldChip({ currentValue, chipValue, presets, customMode = false }) {
  if (chipValue === CUSTOM_CHIP_VALUE) {
    return {
      value: normalizeFieldValue(currentValue),
      customMode: true,
    };
  }

  const next = normalizeFieldValue(chipValue);
  return {
    value: next,
    customMode: false,
  };
}

/**
 * Commit custom text entry for a field.
 *
 * @param {string|null|undefined} customText
 * @returns {{ value: string; customMode: boolean }}
 */
export function commitCustomFieldValue(customText) {
  return {
    value: normalizeFieldValue(customText),
    customMode: false,
  };
}

/**
 * Seed dose chip presets from the medicine name when it embeds a strength
 * (e.g. "Crocin 500mg") plus the global common list.
 *
 * @param {string|null|undefined} medicineName
 * @param {ReadonlyArray<string>} [commonPresets]
 * @returns {string[]}
 */
export function dosePresetsForMedicine(medicineName, commonPresets = PRESCRIPTION_DOSE_PRESETS) {
  const name = normalizeFieldValue(medicineName);
  /** @type {string[]} */
  const seeded = [];

  if (name) {
    const strengthMatch = name.match(/(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu)\b)/i);
    if (strengthMatch) {
      const strength = strengthMatch[1].replace(/\s+/g, "").toLowerCase();
      // Prefer canonical casing used in presets when possible.
      const canonical =
        commonPresets.find((p) => fieldValuesEqual(p, strength)) ?? strengthMatch[1].replace(/\s+/g, "");
      seeded.push(canonical);
    }
  }

  const seen = new Set(seeded.map((v) => v.toLowerCase()));
  for (const preset of commonPresets) {
    const key = preset.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      seeded.push(preset);
    }
  }
  return seeded;
}

export { CUSTOM_CHIP_VALUE };
