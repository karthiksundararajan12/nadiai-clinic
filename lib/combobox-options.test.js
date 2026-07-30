import test from "node:test";
import assert from "node:assert/strict";
import { filterComboboxOptions } from "./combobox-options.js";

const OPTIONS = Object.freeze([
  "Augmentin 625 Duo Tablet",
  "Azithral 500 Tablet",
  "Crocin 500 Tablet",
  "Dolo 650 Tablet",
  "Pantocid 40 Tablet",
]);

test("filterComboboxOptions returns all options on empty query by default", () => {
  assert.deepEqual(filterComboboxOptions(OPTIONS, ""), [...OPTIONS]);
  assert.deepEqual(filterComboboxOptions(OPTIONS, "   "), [...OPTIONS]);
});

test("filterComboboxOptions returns nothing on empty query when showAllOnEmpty is false", () => {
  assert.deepEqual(
    filterComboboxOptions(OPTIONS, "", { showAllOnEmpty: false }),
    [],
  );
});

test("filterComboboxOptions caps rendered suggestions", () => {
  const many = Array.from({ length: 200 }, (_, i) => `Drug ${i} Tablet`);
  const capped = filterComboboxOptions(many, "Drug", { maxSuggestions: 75 });
  assert.equal(capped.length, 75);
  assert.equal(capped[0], "Drug 0 Tablet");
  assert.equal(capped[74], "Drug 74 Tablet");
});

test("filterComboboxOptions still allows free-text when nothing matches", () => {
  const matches = filterComboboxOptions(OPTIONS, "zzzz-not-a-drug", {
    maxSuggestions: 75,
  });
  assert.deepEqual(matches, []);
});

test("filterComboboxOptions matches case-insensitively", () => {
  assert.deepEqual(filterComboboxOptions(OPTIONS, "azithral"), [
    "Azithral 500 Tablet",
  ]);
});
