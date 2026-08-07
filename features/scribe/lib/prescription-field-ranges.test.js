import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_CHIP_VALUE,
  PRESCRIPTION_DOSE_PRESETS,
  PRESCRIPTION_DURATION_PRESETS,
  PRESCRIPTION_FREQUENCY_OPTIONS,
  buildFieldChipOptions,
  commitCustomFieldValue,
  dosePresetsForMedicine,
  fieldValuesEqual,
  isPresetValue,
  isRangeValue,
  normalizeFieldValue,
  resolveSelectedChipValue,
  selectFieldChip,
} from "./prescription-field-ranges.js";

test("isRangeValue detects dose and duration ranges without mistaking frequency patterns", () => {
  assert.equal(isRangeValue("3-4 days"), true);
  assert.equal(isRangeValue("1–2 tablets"), true);
  assert.equal(isRangeValue("500-650mg"), true);
  assert.equal(isRangeValue("1-0-1"), false);
  assert.equal(isRangeValue("1-1-1"), false);
  assert.equal(isRangeValue("5 days"), false);
  assert.equal(isRangeValue("OD"), false);
  assert.equal(isRangeValue(""), false);
  assert.equal(isRangeValue(null), false);
});

test("frequency vocabulary includes OD/BD/TDS/QID/SOS and schedule patterns", () => {
  for (const freq of ["OD", "BD", "TDS", "QID", "SOS", "1-0-1", "1-1-1"]) {
    assert.ok(PRESCRIPTION_FREQUENCY_OPTIONS.includes(freq), `missing ${freq}`);
  }
});

test("duration presets cover common clinic ranges plus weeks", () => {
  assert.deepEqual([...PRESCRIPTION_DURATION_PRESETS], [
    "3 days",
    "5 days",
    "7 days",
    "10 days",
    "2 weeks",
  ]);
});

test("buildFieldChipOptions preserves a range value as a distinct range chip", () => {
  const options = buildFieldChipOptions({
    currentValue: "3-4 days",
    presets: PRESCRIPTION_DURATION_PRESETS,
  });

  assert.equal(options[0].kind, "range");
  assert.equal(options[0].value, "3-4 days");
  assert.ok(options.some((o) => o.value === "5 days" && o.kind === "preset"));
  assert.ok(options.some((o) => o.value === CUSTOM_CHIP_VALUE && o.kind === "custom"));
  // Range must not replace or collapse to a single preset day count.
  assert.equal(
    options.filter((o) => o.kind === "preset" && o.value === "3 days").length,
    1,
  );
  assert.ok(!options.some((o) => o.kind === "preset" && o.value === "3-4 days"));
});

test("buildFieldChipOptions keeps non-preset free text as a current chip", () => {
  const options = buildFieldChipOptions({
    currentValue: "until review",
    presets: PRESCRIPTION_DURATION_PRESETS,
  });
  assert.equal(options[0].kind, "current");
  assert.equal(options[0].value, "until review");
});

test("buildFieldChipOptions does not duplicate when value matches a preset", () => {
  const options = buildFieldChipOptions({
    currentValue: "5 days",
    presets: PRESCRIPTION_DURATION_PRESETS,
  });
  assert.equal(options.filter((o) => fieldValuesEqual(o.value, "5 days")).length, 1);
  assert.ok(!options.some((o) => o.kind === "range" || o.kind === "current"));
});

test("resolveSelectedChipValue selects preset, range, or custom mode", () => {
  assert.equal(
    resolveSelectedChipValue({
      currentValue: "BD",
      presets: PRESCRIPTION_FREQUENCY_OPTIONS,
    }),
    "BD",
  );
  assert.equal(
    resolveSelectedChipValue({
      currentValue: "3-4 days",
      presets: PRESCRIPTION_DURATION_PRESETS,
    }),
    "3-4 days",
  );
  assert.equal(
    resolveSelectedChipValue({
      currentValue: "5 days",
      presets: PRESCRIPTION_DURATION_PRESETS,
      customMode: true,
    }),
    CUSTOM_CHIP_VALUE,
  );
  assert.equal(
    resolveSelectedChipValue({
      currentValue: "",
      presets: PRESCRIPTION_DURATION_PRESETS,
    }),
    "",
  );
});

test("selectFieldChip updates draft value and toggles custom mode", () => {
  assert.deepEqual(
    selectFieldChip({
      currentValue: "3 days",
      chipValue: "7 days",
      presets: PRESCRIPTION_DURATION_PRESETS,
    }),
    { value: "7 days", customMode: false },
  );

  assert.deepEqual(
    selectFieldChip({
      currentValue: "3-4 days",
      chipValue: "3-4 days",
      presets: PRESCRIPTION_DURATION_PRESETS,
    }),
    { value: "3-4 days", customMode: false },
  );

  const customOpen = selectFieldChip({
    currentValue: "3-4 days",
    chipValue: CUSTOM_CHIP_VALUE,
    presets: PRESCRIPTION_DURATION_PRESETS,
  });
  assert.equal(customOpen.customMode, true);
  assert.equal(customOpen.value, "3-4 days");

  // Selecting a preset after a range keeps the range intact until replaced.
  assert.deepEqual(
    selectFieldChip({
      currentValue: "3-4 days",
      chipValue: "5 days",
      presets: PRESCRIPTION_DURATION_PRESETS,
    }),
    { value: "5 days", customMode: false },
  );
});

test("commitCustomFieldValue normalizes custom entry and closes custom mode", () => {
  assert.deepEqual(commitCustomFieldValue("  14 days  "), {
    value: "14 days",
    customMode: false,
  });
  assert.deepEqual(commitCustomFieldValue(""), {
    value: "",
    customMode: false,
  });
});

test("dosePresetsForMedicine seeds strength from medicine name without dropping commons", () => {
  const presets = dosePresetsForMedicine("Crocin 500mg Tablet");
  assert.equal(presets[0], "500mg");
  assert.ok(presets.includes("250mg"));
  assert.ok(presets.includes("650mg"));
  // No duplicate 500mg entries.
  assert.equal(presets.filter((p) => fieldValuesEqual(p, "500mg")).length, 1);
});

test("dosePresetsForMedicine falls back to common presets when name has no strength", () => {
  const presets = dosePresetsForMedicine("Azithral");
  assert.deepEqual(presets, [...PRESCRIPTION_DOSE_PRESETS]);
});

test("isPresetValue and normalizeFieldValue helpers", () => {
  assert.equal(normalizeFieldValue("  BD  "), "BD");
  assert.equal(isPresetValue("bd", PRESCRIPTION_FREQUENCY_OPTIONS), true);
  assert.equal(isPresetValue("3-4 days", PRESCRIPTION_DURATION_PRESETS), false);
  assert.equal(fieldValuesEqual("500 mg", "500mg"), false);
  assert.equal(fieldValuesEqual("3–4 days", "3-4 days"), true);
});

test("selecting frequency chip never collapses a range duration in sibling state", () => {
  // Pure field helpers are independent — range duration stays as its own chip option.
  const durationOptions = buildFieldChipOptions({
    currentValue: "3-4 days",
    presets: PRESCRIPTION_DURATION_PRESETS,
  });
  const freqNext = selectFieldChip({
    currentValue: "OD",
    chipValue: "TDS",
    presets: PRESCRIPTION_FREQUENCY_OPTIONS,
  });
  assert.equal(freqNext.value, "TDS");
  assert.equal(durationOptions[0].value, "3-4 days");
  assert.equal(durationOptions[0].kind, "range");
});
