import test from "node:test";
import assert from "node:assert/strict";
import { PrescriptionRepository } from "../repository/prescription.repository.js";

/**
 * @param {{
 *   row?: Record<string, unknown>|null;
 *   error?: { code: string }|null;
 * }} [config]
 */
function mockSupabase(config = {}) {
  /** @type {{ table: string; select?: string; filters: Record<string, unknown>; nullFilters: string[] }} */
  const captured = { table: "", filters: {}, nullFilters: [] };

  return {
    captured,
    from(table) {
      captured.table = table;
      const chain = {
        select(columns) {
          captured.select = columns;
          return chain;
        },
        eq(column, value) {
          captured.filters[column] = value;
          return chain;
        },
        is(column, value) {
          if (value === null) captured.nullFilters.push(column);
          return chain;
        },
        single: async () => {
          if (config.error) return { data: null, error: config.error };
          if (config.row) return { data: config.row, error: null };
          return { data: null, error: { code: "PGRST116" } };
        },
      };
      return chain;
    },
  };
}

test("prescription _getPatient uses clinic_id + full_name and maps to name", async () => {
  const supabase = mockSupabase({
    row: {
      id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
      full_name: "Karthik",
      age_years: 40,
      gender: null,
      contact_phone: "919840227132",
    },
  });
  const repo = new PrescriptionRepository(supabase);

  const result = await repo._getPatient(
    "6c721819-6465-4948-90aa-d47cc1b40f8f",
    "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  );

  assert.deepEqual(result, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    name: "Karthik",
    age: 40,
    gender: null,
    phone: "919840227132",
    condition: null,
    status: null,
    last_visit: null,
  });
  assert.equal(supabase.captured.select, "id, full_name, age_years, gender, contact_phone");
  assert.deepEqual(supabase.captured.filters, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    clinic_id: "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  });
  assert.ok(!("doctor_id" in supabase.captured.filters));
});

test("getGenerationContext threads session.clinic_id into _getPatient", async () => {
  const calls = [];
  const repo = new PrescriptionRepository({});
  repo._runNullable = async (_fn, op) => {
    if (op === "getPrescriptionSession") {
      return {
        id: "f51916c5-ba49-4067-9bf8-d130f13a96b1",
        doctor_id: "doctor-1",
        clinic_id: "clinic-1",
        patient_id: "patient-1",
        appointment_id: null,
      };
    }
    return null;
  };
  repo._getApprovedSoapNote = async () => ({ id: "soap-1", status: "approved" });
  repo._getPatient = async (patientId, clinicId) => {
    calls.push({ patientId, clinicId });
    return { id: patientId, name: "Karthik", age: 40, gender: null, phone: null, condition: null, status: null, last_visit: null };
  };
  repo._getDoctor = async () => null;
  repo._getAppointment = async () => null;
  repo._getLatestTranscriptVersion = async () => null;

  const ctx = await repo.getGenerationContext("f51916c5-ba49-4067-9bf8-d130f13a96b1");
  assert.equal(ctx.patient.name, "Karthik");
  assert.deepEqual(calls, [{ patientId: "patient-1", clinicId: "clinic-1" }]);
});
