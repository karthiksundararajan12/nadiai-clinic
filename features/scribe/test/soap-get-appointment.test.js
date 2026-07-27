import test from "node:test";
import assert from "node:assert/strict";
import { SOAPRepository, mapClinicAppointment } from "../repository/soap.repository.js";

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

test("mapClinicAppointment maps slot_start → date/time and nulls legacy fields", () => {
  assert.deepEqual(
    mapClinicAppointment({
      id: "appt-1",
      patient_id: "patient-1",
      slot_start: "2026-07-27T09:30:00+05:30",
      slot_end: "2026-07-27T09:45:00+05:30",
      status: "confirmed",
    }),
    {
      id: "appt-1",
      patient_id: "patient-1",
      patient_name: null,
      date: "2026-07-27",
      time: "09:30",
      type: null,
      status: "confirmed",
      notes: null,
      slot_start: "2026-07-27T09:30:00+05:30",
      slot_end: "2026-07-27T09:45:00+05:30",
    },
  );
});

test("_getAppointment queries clinic-scoped columns (not patient_name/date/time)", async () => {
  const supabase = mockSupabase({
    row: {
      id: "appt-1",
      patient_id: "patient-1",
      slot_start: "2026-07-27T09:30:00+05:30",
      slot_end: "2026-07-27T09:45:00+05:30",
      status: "confirmed",
    },
  });
  const repo = new SOAPRepository(supabase);

  const result = await repo._getAppointment("appt-1", "doctor-1");

  assert.equal(supabase.captured.table, "appointments");
  assert.equal(supabase.captured.select, "id, patient_id, slot_start, slot_end, status");
  assert.deepEqual(supabase.captured.filters, {
    id: "appt-1",
    doctor_id: "doctor-1",
  });
  assert.deepEqual(supabase.captured.nullFilters, ["deleted_at"]);
  assert.equal(result.date, "2026-07-27");
  assert.equal(result.time, "09:30");
  assert.equal(result.patient_name, null);
  assert.equal(result.type, null);
  assert.equal(result.notes, null);
});
