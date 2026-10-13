import test from "node:test";
import assert from "node:assert/strict";
import { buildPatientInsert } from "../lib/patient-insert.js";

const NOW = new Date("2026-10-13T12:30:00.000Z");

test("buildPatientInsert keeps an explicit consent decline as false/null", () => {
  const row = buildPatientInsert(
    {
      clinic_id: "clinic-1",
      full_name: "Asha Rao",
      contact_phone: "919876543210",
      consent_given: false,
      consent_given_at: "2020-01-01T00:00:00.000Z",
    },
    NOW,
  );

  assert.equal(row.consent_given, false);
  assert.equal(row.consent_given_at, null);
  assert.equal(row.relationship_to_contact, "self");
});

test("buildPatientInsert keeps an explicit consent timestamp", () => {
  const row = buildPatientInsert(
    {
      clinic_id: "clinic-1",
      full_name: "Asha Rao",
      contact_phone: "919876543210",
      consent_given: true,
      consent_given_at: "2026-10-13T12:30:00.000Z",
    },
    new Date("2026-01-01T00:00:00.000Z"),
  );

  assert.equal(row.consent_given, true);
  assert.equal(row.consent_given_at, "2026-10-13T12:30:00.000Z");
});

test("buildPatientInsert stamps consent when the WhatsApp path omits it", () => {
  const row = buildPatientInsert(
    {
      clinic_id: "clinic-1",
      full_name: "Asha Rao",
      contact_phone: "919876543210",
    },
    NOW,
  );

  assert.equal(row.consent_given, true);
  assert.equal(row.consent_given_at, "2026-10-13T12:30:00.000Z");
});
