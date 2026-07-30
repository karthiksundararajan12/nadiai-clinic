import test from "node:test";
import assert from "node:assert/strict";
import {
  NAV_SPECIALIZATION_REQUIREMENTS,
  PEDIATRIC_SPECIALIZATION_PATTERN,
  canAccessNavItem,
  canAccessPath,
  filterNavItems,
  isPediatricSpecialization,
  matchesSpecialization,
} from "./specialization-nav.js";
import { NAV_ITEMS } from "./constants.js";

const ALWAYS_VISIBLE_TITLES = [
  "Dashboard",
  "Scribe",
  "Appointments",
  "Payments",
  "Patients",
  "Settings",
];

test("PEDIATRIC_SPECIALIZATION_PATTERN matches American and British spellings", () => {
  assert.equal(PEDIATRIC_SPECIALIZATION_PATTERN.test("Pediatrician"), true);
  assert.equal(PEDIATRIC_SPECIALIZATION_PATTERN.test("paediatrician"), true);
  assert.equal(PEDIATRIC_SPECIALIZATION_PATTERN.test("PEDIATRIC CARDIOLOGY"), true);
  assert.equal(PEDIATRIC_SPECIALIZATION_PATTERN.test("General Physician"), false);
  assert.equal(PEDIATRIC_SPECIALIZATION_PATTERN.test("Cardiologist"), false);
});

test("isPediatricSpecialization mirrors VaccinationSeedingService heuristic", () => {
  assert.equal(isPediatricSpecialization("Pediatrician"), true);
  assert.equal(isPediatricSpecialization("Paediatrician"), true);
  assert.equal(isPediatricSpecialization("General Physician"), false);
  assert.equal(isPediatricSpecialization(""), false);
  assert.equal(isPediatricSpecialization(null), false);
  assert.equal(isPediatricSpecialization(undefined), false);
});

test("matchesSpecialization requires both a value and a pattern hit", () => {
  assert.equal(matchesSpecialization("Pediatrician", /pa?ediatric/i), true);
  assert.equal(matchesSpecialization("GP", /pa?ediatric/i), false);
  assert.equal(matchesSpecialization("", /pa?ediatric/i), false);
});

test("NAV_SPECIALIZATION_REQUIREMENTS currently gates only vaccinations", () => {
  assert.deepEqual(Object.keys(NAV_SPECIALIZATION_REQUIREMENTS), ["/vaccinations"]);
  assert.equal(
    NAV_SPECIALIZATION_REQUIREMENTS["/vaccinations"],
    PEDIATRIC_SPECIALIZATION_PATTERN,
  );
});

test("canAccessNavItem: vaccinations is pediatric-only; other items are open", () => {
  assert.equal(canAccessNavItem("/vaccinations", "Pediatrician"), true);
  assert.equal(canAccessNavItem("/vaccinations", "General Physician"), false);
  assert.equal(canAccessNavItem("/vaccinations", ""), false);
  assert.equal(canAccessNavItem("/dashboard", "General Physician"), true);
  assert.equal(canAccessNavItem("/settings", "Cardiologist"), true);
  assert.equal(canAccessNavItem("/patients", null), true);
});

test("canAccessPath gates nested vaccination routes the same way", () => {
  assert.equal(canAccessPath("/vaccinations", "Pediatrician"), true);
  assert.equal(canAccessPath("/vaccinations/new", "Pediatrician"), true);
  assert.equal(canAccessPath("/vaccinations", "General Physician"), false);
  assert.equal(canAccessPath("/vaccinations/new", "General Physician"), false);
  assert.equal(canAccessPath("/appointments", "General Physician"), true);
  assert.equal(canAccessPath("/dashboard", ""), true);
});

test("filterNavItems: pediatrician sees Vaccinations; general physician does not", () => {
  const pediatricNav = filterNavItems(NAV_ITEMS, "Pediatrician");
  const gpNav = filterNavItems(NAV_ITEMS, "General Physician");

  assert.ok(pediatricNav.some((item) => item.href === "/vaccinations"));
  assert.ok(!gpNav.some((item) => item.href === "/vaccinations"));

  for (const title of ALWAYS_VISIBLE_TITLES) {
    assert.ok(
      pediatricNav.some((item) => item.title === title),
      `pediatrician missing always-visible item "${title}"`,
    );
    assert.ok(
      gpNav.some((item) => item.title === title),
      `general physician missing always-visible item "${title}"`,
    );
  }

  assert.equal(pediatricNav.length, NAV_ITEMS.length);
  assert.equal(gpNav.length, NAV_ITEMS.length - 1);
});

test("filterNavItems hides Vaccinations while specialization is still unknown", () => {
  const pending = filterNavItems(NAV_ITEMS, "");
  assert.ok(!pending.some((item) => item.href === "/vaccinations"));
  assert.equal(pending.length, NAV_ITEMS.length - 1);
});
