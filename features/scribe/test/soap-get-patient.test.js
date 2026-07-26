import test from "node:test";
import assert from "node:assert/strict";
import { SOAPRepository } from "../repository/soap.repository.js";

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

test("_getPatient queries clinic-scoped patients and maps full_name → name", async () => {
  const supabase = mockSupabase({
    row: {
      id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
      full_name: "Karthik",
      age_years: 34,
      gender: "male",
      contact_phone: "919840227132",
    },
  });
  const repo = new SOAPRepository(supabase);

  const result = await repo._getPatient(
    "6c721819-6465-4948-90aa-d47cc1b40f8f",
    "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  );

  assert.deepEqual(result, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    name: "Karthik",
    age: 34,
    gender: "male",
    phone: "919840227132",
    condition: null,
    status: null,
    last_visit: null,
  });
  assert.equal(supabase.captured.table, "patients");
  assert.equal(supabase.captured.select, "id, full_name, age_years, gender, contact_phone");
  assert.deepEqual(supabase.captured.filters, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    clinic_id: "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  });
  assert.ok(!("doctor_id" in supabase.captured.filters));
  assert.deepEqual(supabase.captured.nullFilters, ["deleted_at"]);
});

test("getGenerationContext threads session.clinic_id into _getPatient", async () => {
  const calls = [];
  const repo = new SOAPRepository({});
  repo._runNullable = async (fn, op) => {
    if (op === "getSoapSession") {
      return {
        id: "sess-1",
        doctor_id: "doctor-1",
        clinic_id: "clinic-1",
        patient_id: "patient-1",
        appointment_id: null,
        language: "en",
      };
    }
    return null;
  };
  repo._getPatient = async (patientId, clinicId) => {
    calls.push({ patientId, clinicId });
    return { id: patientId, name: "Asha", age: null, gender: null, phone: null, condition: null, status: null, last_visit: null };
  };
  repo._getDoctor = async () => null;
  repo._getAppointment = async () => null;
  repo.getLatestTranscriptVersion = async () => null;
  repo._getTranscriptSegments = async () => [];

  const ctx = await repo.getGenerationContext("sess-1");
  assert.equal(ctx.patient.name, "Asha");
  assert.deepEqual(calls, [{ patientId: "patient-1", clinicId: "clinic-1" }]);
});
