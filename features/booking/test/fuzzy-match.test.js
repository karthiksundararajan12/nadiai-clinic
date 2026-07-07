import test from "node:test";
import assert from "node:assert/strict";
import { levenshteinDistance, nameSimilarity, findClosestPatientMatch } from "../lib/fuzzy-match.js";

test("levenshteinDistance: identical strings have distance 0", () => {
  assert.equal(levenshteinDistance("Rohan", "Rohan"), 0);
});

test("levenshteinDistance: empty-string edge cases", () => {
  assert.equal(levenshteinDistance("", ""), 0);
  assert.equal(levenshteinDistance("abc", ""), 3);
  assert.equal(levenshteinDistance("", "abc"), 3);
});

test("levenshteinDistance: single substitution/insertion/deletion", () => {
  assert.equal(levenshteinDistance("Rohan", "Rohn"), 1); // deletion
  assert.equal(levenshteinDistance("Rohan", "Rohsan"), 1); // insertion
  assert.equal(levenshteinDistance("Rohan", "Rohin"), 1); // substitution
});

test("nameSimilarity: case/whitespace-insensitive, identical after normalization scores 1", () => {
  assert.equal(nameSimilarity("Rohan Sharma", "  rohan   sharma "), 1);
});

test("nameSimilarity: completely different names score low", () => {
  assert.ok(nameSimilarity("Rohan Sharma", "Priya Patel") < 0.4);
});

test("nameSimilarity: a small typo scores high but not 1", () => {
  const score = nameSimilarity("Rohan", "Rohn");
  assert.ok(score > 0.7 && score < 1);
});

test("findClosestPatientMatch: returns null when nothing clears the threshold", () => {
  const candidates = [{ id: "p1", full_name: "Priya Patel" }];
  assert.equal(findClosestPatientMatch("Rohan Sharma", candidates, 0.82), null);
});

test("findClosestPatientMatch: returns the best match above threshold", () => {
  const candidates = [
    { id: "p1", full_name: "Priya Patel" },
    { id: "p2", full_name: "Rohan Sharma" },
    { id: "p3", full_name: "Rohn Sharma" },
  ];
  const match = findClosestPatientMatch("Rohan Sharma", candidates, 0.82);
  assert.ok(match);
  assert.equal(match.candidate.id, "p2");
  assert.equal(match.score, 1);
});

test("findClosestPatientMatch: empty candidate list returns null", () => {
  assert.equal(findClosestPatientMatch("Rohan Sharma", [], 0.82), null);
});
