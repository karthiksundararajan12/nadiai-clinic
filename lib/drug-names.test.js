import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  filterDrugNameSuggestions,
  resetDrugNamesCacheForTests,
} from "./drug-names.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DRUG_NAMES_PATH = path.join(ROOT, "..", "public", "data", "drug-names.json");

test("drug-names.json is a non-empty deduped string array", () => {
  const raw = readFileSync(DRUG_NAMES_PATH, "utf8");
  const names = JSON.parse(raw);
  assert.ok(Array.isArray(names));
  assert.ok(names.length > 100_000, `expected large list, got ${names.length}`);
  assert.equal(typeof names[0], "string");
  assert.equal(names.length, new Set(names.map((n) => n.toLowerCase())).size);
});

test("drug-names.json includes a known brand from the source dataset", () => {
  const names = JSON.parse(readFileSync(DRUG_NAMES_PATH, "utf8"));
  assert.ok(names.includes("Augmentin 625 Duo Tablet"));
});

test("filterDrugNameSuggestions requires a query and caps results", () => {
  const names = ["Azithral 500", "Azithral XL", "Crocin", "Augmentin"];
  assert.deepEqual(filterDrugNameSuggestions(names, ""), []);
  assert.deepEqual(filterDrugNameSuggestions(names, "azi", { maxSuggestions: 1 }), [
    "Azithral 500",
  ]);
});

test("resetDrugNamesCacheForTests clears module cache", () => {
  resetDrugNamesCacheForTests();
  // Smoke: callable without throwing.
  assert.equal(typeof resetDrugNamesCacheForTests, "function");
});
