import test from "node:test";
import assert from "node:assert/strict";
import { SessionRepository } from "../repository/session.repository.js";
import { DatabaseError } from "../errors.js";

/**
 * Captures the clinic-scoped patients query shape used by getPatientName.
 *
 * @param {{
 *   row?: { id: string; full_name: string }|null;
 *   error?: { code: string; message?: string }|null;
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

test("getPatientName queries patients by id + clinic_id and maps full_name → name", async () => {
  const supabase = mockSupabase({
    row: { id: "6c721819-6465-4948-90aa-d47cc1b40f8f", full_name: "Karthik" },
  });
  const repo = new SessionRepository(supabase);

  const result = await repo.getPatientName(
    "6c721819-6465-4948-90aa-d47cc1b40f8f",
    "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  );

  assert.deepEqual(result, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    name: "Karthik",
  });
  assert.equal(supabase.captured.table, "patients");
  assert.equal(supabase.captured.select, "id, full_name");
  assert.deepEqual(supabase.captured.filters, {
    id: "6c721819-6465-4948-90aa-d47cc1b40f8f",
    clinic_id: "1c764182-5a46-4c30-9e46-7adf4953b1d4",
  });
  assert.ok(!("doctor_id" in supabase.captured.filters));
  assert.deepEqual(supabase.captured.nullFilters, ["deleted_at"]);
});

test("getPatientName returns null when patient is not found", async () => {
  const repo = new SessionRepository(mockSupabase({}));
  const result = await repo.getPatientName("missing-patient", "clinic-1");
  assert.equal(result, null);
});

test("getPatientName throws DatabaseError on non-not-found failures", async () => {
  const repo = new SessionRepository(
    mockSupabase({ error: { code: "42703", message: 'column "name" does not exist' } }),
  );

  await assert.rejects(
    () => repo.getPatientName("patient-1", "clinic-1"),
    DatabaseError,
  );
});
