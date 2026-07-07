import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentRepository } from "../repository/appointment.repository.js";
import { DatabaseError } from "../errors.js";

/**
 * Minimal fake standing in for a Supabase query builder: chainable methods
 * record their calls (for assertions on how a query was constructed) and
 * the builder resolves — like the real thing — when awaited/thenable.
 */
class FakeQueryBuilder {
  constructor(result) {
    this._result = result;
    this.calls = [];
  }

  _record(method, args) {
    this.calls.push({ method, args });
    return this;
  }

  select(...args) { return this._record("select", args); }
  eq(...args) { return this._record("eq", args); }
  is(...args) { return this._record("is", args); }
  not(...args) { return this._record("not", args); }
  or(...args) { return this._record("or", args); }
  gte(...args) { return this._record("gte", args); }
  lt(...args) { return this._record("lt", args); }
  gt(...args) { return this._record("gt", args); }
  lte(...args) { return this._record("lte", args); }
  insert(data) {
    this.insertedData = data;
    return this._record("insert", [data]);
  }
  update(patch) {
    this.updatedWith = patch;
    return this._record("update", [patch]);
  }
  single() { return this._record("single", []); }

  then(resolve, reject) {
    return Promise.resolve(this._result).then(resolve, reject);
  }
}

/**
 * `result` is returned for every query issued against this fake client —
 * fine for tests that only care about one call's outcome (createIfAvailable
 * issues a release UPDATE before its own INSERT; both resolve to the same
 * canned `result` here, and the release step logs-and-swallows any "error"
 * it happens to see, so it never affects these tests' assertions).
 */
function createFakeSupabaseClient(result) {
  const builders = [];
  return {
    from() {
      const builder = new FakeQueryBuilder(result);
      builders.push(builder);
      return builder;
    },
    get builders() {
      return builders;
    },
    get lastBuilder() {
      return builders[builders.length - 1];
    },
  };
}

// ─────────────────────────────────────────────────────────────
// findTakenSlotStarts
// ─────────────────────────────────────────────────────────────

test("findTakenSlotStarts: maps rows to slot_start strings and scopes by clinic/doctor/window, excluding cancelled/rescheduled", async () => {
  const rows = [{ slot_start: "2026-07-06T03:30:00.000Z" }, { slot_start: "2026-07-06T04:00:00.000Z" }];
  const db = createFakeSupabaseClient({ data: rows, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.findTakenSlotStarts(
    "clinic-1",
    "doc-1",
    "2026-07-06T00:00:00.000Z",
    "2026-07-13T00:00:00.000Z",
  );

  assert.deepEqual(result, ["2026-07-06T03:30:00.000Z", "2026-07-06T04:00:00.000Z"]);
  const methods = db.lastBuilder.calls.map((c) => c.method);
  assert.ok(methods.includes("eq"));
  assert.ok(methods.includes("is"));
  assert.ok(methods.includes("not"));
  assert.ok(methods.includes("gte"));
  assert.ok(methods.includes("lt"));
  const eqArgs = db.lastBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some(([col, val]) => col === "clinic_id" && val === "clinic-1"));
  assert.ok(eqArgs.some(([col, val]) => col === "doctor_id" && val === "doc-1"));
  const notArgs = db.lastBuilder.calls.find((c) => c.method === "not").args;
  assert.deepEqual(notArgs, ["status", "in", "(cancelled,rescheduled)"]);
});

test("findTakenSlotStarts: excludes a PAYMENT_PENDING row whose hold has already expired — treats it as available again", async () => {
  const now = Date.now();
  const rows = [
    { slot_start: "2026-07-06T03:30:00.000Z", status: "confirmed", hold_expires_at: null },
    { slot_start: "2026-07-06T04:00:00.000Z", status: "payment_pending", hold_expires_at: new Date(now + 5 * 60 * 1000).toISOString() },
    { slot_start: "2026-07-06T04:30:00.000Z", status: "payment_pending", hold_expires_at: new Date(now - 5 * 60 * 1000).toISOString() },
  ];
  const db = createFakeSupabaseClient({ data: rows, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.findTakenSlotStarts("clinic-1", "doc-1", "2026-07-06T00:00:00.000Z", "2026-07-13T00:00:00.000Z");

  // Confirmed and the non-expired hold are still taken; the expired hold is not.
  assert.deepEqual(result, ["2026-07-06T03:30:00.000Z", "2026-07-06T04:00:00.000Z"]);
});

// ─────────────────────────────────────────────────────────────
// findOverlappingConfirmedForPatient
// ─────────────────────────────────────────────────────────────

test("findOverlappingConfirmedForPatient: scopes by clinic/patient/confirmed status and returns rows as-is", async () => {
  const rows = [{ id: "appt-1", slot_start: "2026-07-06T03:30:00.000Z", slot_end: "2026-07-06T04:00:00.000Z" }];
  const db = createFakeSupabaseClient({ data: rows, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.findOverlappingConfirmedForPatient(
    "clinic-1",
    "p1",
    "2026-07-06T04:00:00.000Z",
    "2026-07-06T04:30:00.000Z",
  );

  assert.deepEqual(result, rows);
  const eqArgs = db.lastBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some(([col, val]) => col === "patient_id" && val === "p1"));
  assert.ok(eqArgs.some(([col, val]) => col === "status" && val === "confirmed"));
});

// ─────────────────────────────────────────────────────────────
// createIfAvailable — race-condition / conflict branching
// ─────────────────────────────────────────────────────────────

const APPOINTMENT_DATA = {
  clinic_id: "clinic-1",
  doctor_id: "doc-1",
  patient_id: "p1",
  contact_phone: "919876543210",
  slot_start: "2026-07-06T03:30:00.000Z",
  slot_end: "2026-07-06T04:00:00.000Z",
  status: "confirmed",
  wa_message_id: "wamid.1",
};

test("createIfAvailable: successful insert returns the row with no conflict", async () => {
  const created = { id: "appt-1", ...APPOINTMENT_DATA };
  const db = createFakeSupabaseClient({ data: created, error: null });
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, null);
  assert.deepEqual(row, created);
  assert.deepEqual(db.lastBuilder.insertedData, APPOINTMENT_DATA);
});

test("createIfAvailable: releases an expired hold on this exact slot immediately before inserting", async () => {
  const created = { id: "appt-1", ...APPOINTMENT_DATA };
  const db = createFakeSupabaseClient({ data: created, error: null });
  const repo = new AppointmentRepository(db);

  await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(db.builders.length, 2, "expected one release UPDATE, then one INSERT");
  const [releaseBuilder, insertBuilder] = db.builders;

  assert.equal(releaseBuilder.calls[0].method, "update");
  assert.equal(releaseBuilder.updatedWith.status, "cancelled");
  assert.equal(releaseBuilder.updatedWith.cancellation_reason, "hold_expired");
  assert.ok(releaseBuilder.updatedWith.cancelled_at);

  const releaseEq = releaseBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(releaseEq.some(([col, val]) => col === "doctor_id" && val === APPOINTMENT_DATA.doctor_id));
  assert.ok(releaseEq.some(([col, val]) => col === "slot_start" && val === APPOINTMENT_DATA.slot_start));
  assert.ok(releaseEq.some(([col, val]) => col === "status" && val === "payment_pending"));
  assert.ok(releaseBuilder.calls.some((c) => c.method === "lte" && c.args[0] === "hold_expires_at"));

  assert.equal(insertBuilder.calls[0].method, "insert");
  assert.deepEqual(insertBuilder.insertedData, APPOINTMENT_DATA);
});

test("createIfAvailable: appointments_no_double_booking violation is reported as SLOT_TAKEN, not thrown", async () => {
  const error = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "appointments_no_double_booking"',
  };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, "SLOT_TAKEN");
  assert.equal(row, null);
});

test("createIfAvailable: appointments_wa_message_id_key violation is reported as DUPLICATE_MESSAGE, not thrown", async () => {
  const error = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "appointments_wa_message_id_key"',
  };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, "DUPLICATE_MESSAGE");
  assert.equal(row, null);
});

test("createIfAvailable: an unrecognized unique violation is reported as UNKNOWN_CONFLICT, not thrown", async () => {
  const error = { code: "23505", message: 'duplicate key value violates unique constraint "some_other_constraint"' };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, "UNKNOWN_CONFLICT");
  assert.equal(row, null);
});

test("createIfAvailable: a non-constraint DB error throws DatabaseError instead of being swallowed", async () => {
  const error = { code: "08006", message: "connection failure" };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  await assert.rejects(() => repo.createIfAvailable(APPOINTMENT_DATA), DatabaseError);
});

// ─────────────────────────────────────────────────────────────
// createIfAvailable — genuine concurrency, against a stateful fake "DB"
// that reproduces the appointments_no_double_booking partial unique index
// (doctor_id, slot_start) WHERE status NOT IN ('cancelled','rescheduled'),
// instead of a canned single response per test.
// ─────────────────────────────────────────────────────────────

class StatefulFakeAppointmentsBuilder {
  constructor(rows, idRef) {
    this._rows = rows;
    this._idRef = idRef;
    this._filters = [];
    this._mode = "select";
  }

  _isActive(row) {
    return row.status !== "cancelled" && row.status !== "rescheduled";
  }

  select() { return this; }
  eq(col, val) { this._filters.push((r) => r[col] === val); return this; }
  is(col, val) {
    this._filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  not(col, op, val) {
    if (op === "is") this._filters.push((r) => (val === null ? r[col] != null : r[col] !== val));
    return this;
  }
  lte(col, val) { this._filters.push((r) => r[col] != null && r[col] <= val); return this; }
  gte(col, val) { this._filters.push((r) => r[col] >= val); return this; }
  lt(col, val) { this._filters.push((r) => r[col] < val); return this; }
  insert(data) { this._mode = "insert"; this._insertData = data; return this; }
  update(patch) { this._mode = "update"; this._patch = patch; return this; }
  single() { this._single = true; return this; }

  then(resolve) {
    if (this._mode === "insert") {
      const conflict = this._rows.find(
        (r) => r.doctor_id === this._insertData.doctor_id && r.slot_start === this._insertData.slot_start && this._isActive(r),
      );
      if (conflict) {
        resolve({
          data: null,
          error: { code: "23505", message: 'duplicate key value violates unique constraint "appointments_no_double_booking"' },
        });
        return;
      }
      const row = { id: `appt-${this._idRef.next++}`, ...this._insertData };
      this._rows.push(row);
      resolve({ data: row, error: null });
      return;
    }
    if (this._mode === "update") {
      this._rows.filter((r) => this._filters.every((f) => f(r))).forEach((r) => Object.assign(r, this._patch));
      resolve({ data: null, error: null });
      return;
    }
    const matched = this._rows.filter((r) => this._filters.every((f) => f(r)));
    resolve({ data: this._single ? (matched[0] ?? null) : matched, error: null });
  }
}

function createStatefulFakeAppointmentsDb(initialRows = []) {
  const rows = [...initialRows];
  const idRef = { next: 1 };
  return {
    rows,
    from() {
      return new StatefulFakeAppointmentsBuilder(rows, idRef);
    },
  };
}

test("createIfAvailable: two near-simultaneous selections of the same free slot — exactly one wins, the other is told SLOT_TAKEN", async () => {
  const db = createStatefulFakeAppointmentsDb();
  const repo = new AppointmentRepository(db);
  const dataA = { ...APPOINTMENT_DATA, wa_message_id: "wamid.A", patient_id: "p-a" };
  const dataB = { ...APPOINTMENT_DATA, wa_message_id: "wamid.B", patient_id: "p-b" };

  const [resultA, resultB] = await Promise.all([repo.createIfAvailable(dataA), repo.createIfAvailable(dataB)]);

  const outcomes = [resultA, resultB];
  const winners = outcomes.filter((r) => r.conflict === null);
  const losers = outcomes.filter((r) => r.conflict === "SLOT_TAKEN");
  assert.equal(winners.length, 1, "expected exactly one request to win the slot");
  assert.equal(losers.length, 1, "expected exactly one request to be told the slot was taken");
  assert.ok(winners[0].row.id);
  assert.equal(db.rows.filter((r) => r.status !== "cancelled").length, 1, "only one active appointment row should exist for this slot");
});

test("createIfAvailable: a booking attempt reclaims a same-slot hold that has already expired instead of being blocked by it", async () => {
  const expiredHold = {
    id: "appt-old",
    clinic_id: APPOINTMENT_DATA.clinic_id,
    doctor_id: APPOINTMENT_DATA.doctor_id,
    patient_id: "some-other-patient",
    slot_start: APPOINTMENT_DATA.slot_start,
    slot_end: APPOINTMENT_DATA.slot_end,
    status: "payment_pending",
    hold_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
  };
  const db = createStatefulFakeAppointmentsDb([expiredHold]);
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, null);
  assert.ok(row);
  assert.equal(expiredHold.status, "cancelled", "the expired hold should have been released before the new insert");
  assert.equal(db.rows.length, 2);
});

test("createIfAvailable: a booking attempt is still blocked by a same-slot hold that has NOT expired", async () => {
  const activeHold = {
    id: "appt-active",
    clinic_id: APPOINTMENT_DATA.clinic_id,
    doctor_id: APPOINTMENT_DATA.doctor_id,
    patient_id: "some-other-patient",
    slot_start: APPOINTMENT_DATA.slot_start,
    slot_end: APPOINTMENT_DATA.slot_end,
    status: "payment_pending",
    hold_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  const db = createStatefulFakeAppointmentsDb([activeHold]);
  const repo = new AppointmentRepository(db);

  const { row, conflict } = await repo.createIfAvailable(APPOINTMENT_DATA);

  assert.equal(conflict, "SLOT_TAKEN");
  assert.equal(row, null);
  assert.equal(activeHold.status, "payment_pending", "a non-expired hold must not be released");
});

// ─────────────────────────────────────────────────────────────
// findByIdForClinic
// ─────────────────────────────────────────────────────────────

test("findByIdForClinic: returns the row scoped by id + clinic_id, excluding soft-deleted rows", async () => {
  const found = { id: "appt-1", clinic_id: "clinic-1", status: "payment_pending" };
  const db = createFakeSupabaseClient({ data: found, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.findByIdForClinic("clinic-1", "appt-1");

  assert.deepEqual(result, found);
  const eqArgs = db.lastBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some(([col, val]) => col === "id" && val === "appt-1"));
  assert.ok(eqArgs.some(([col, val]) => col === "clinic_id" && val === "clinic-1"));
});

test("findByIdForClinic: returns null (not an error) when nothing matches", async () => {
  const db = createFakeSupabaseClient({ data: null, error: { code: "PGRST116" } });
  const repo = new AppointmentRepository(db);

  const result = await repo.findByIdForClinic("clinic-1", "missing-appt");

  assert.equal(result, null);
});

// ─────────────────────────────────────────────────────────────
// confirmPayment — Razorpay "payment.captured"
// ─────────────────────────────────────────────────────────────

test("confirmPayment: happy path updates status/payment fields and clears the hold, scoped by the guarded WHERE", async () => {
  const confirmedRow = { id: "appt-1", status: "confirmed", razorpay_payment_id: "pay_123" };
  const db = createFakeSupabaseClient({ data: confirmedRow, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.confirmPayment("clinic-1", "appt-1", "pay_123");

  assert.deepEqual(result, confirmedRow);
  assert.equal(db.lastBuilder.updatedWith.status, "confirmed");
  assert.equal(db.lastBuilder.updatedWith.payment_status, "paid");
  assert.equal(db.lastBuilder.updatedWith.razorpay_payment_id, "pay_123");
  assert.equal(db.lastBuilder.updatedWith.hold_expires_at, null);

  const eqArgs = db.lastBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some(([col, val]) => col === "id" && val === "appt-1"));
  assert.ok(eqArgs.some(([col, val]) => col === "clinic_id" && val === "clinic-1"));
  assert.ok(eqArgs.some(([col, val]) => col === "status" && val === "payment_pending"));
  const orArgs = db.lastBuilder.calls.find((c) => c.method === "or")?.args;
  assert.ok(orArgs && orArgs[0].includes("hold_expires_at.is.null") && orArgs[0].includes("hold_expires_at.gt."));
});

test("confirmPayment: a late/expired payment (guarded UPDATE matches nothing) returns null, not an error", async () => {
  const db = createFakeSupabaseClient({ data: null, error: { code: "PGRST116" } });
  const repo = new AppointmentRepository(db);

  const result = await repo.confirmPayment("clinic-1", "appt-1", "pay_123");

  assert.equal(result, null);
});

test("confirmPayment: a razorpay_payment_id unique violation is treated as an already-processed replay, not thrown", async () => {
  const error = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "appointments_razorpay_payment_id_key"',
  };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  const result = await repo.confirmPayment("clinic-1", "appt-1", "pay_123");

  assert.equal(result, null);
});

test("confirmPayment: a non-constraint DB error throws DatabaseError instead of being swallowed", async () => {
  const error = { code: "08006", message: "connection failure" };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  await assert.rejects(() => repo.confirmPayment("clinic-1", "appt-1", "pay_123"), DatabaseError);
});

// ─────────────────────────────────────────────────────────────
// releaseFailedHold — Razorpay "payment.failed"
// ─────────────────────────────────────────────────────────────

test("releaseFailedHold: happy path cancels the appointment and clears the hold, scoped by the guarded WHERE", async () => {
  const releasedRow = { id: "appt-1", status: "cancelled", payment_status: "failed" };
  const db = createFakeSupabaseClient({ data: releasedRow, error: null });
  const repo = new AppointmentRepository(db);

  const result = await repo.releaseFailedHold("clinic-1", "appt-1");

  assert.deepEqual(result, releasedRow);
  assert.equal(db.lastBuilder.updatedWith.status, "cancelled");
  assert.equal(db.lastBuilder.updatedWith.payment_status, "failed");
  assert.equal(db.lastBuilder.updatedWith.cancellation_reason, "payment_failed");
  assert.equal(db.lastBuilder.updatedWith.hold_expires_at, null);
  assert.ok(db.lastBuilder.updatedWith.cancelled_at);

  const eqArgs = db.lastBuilder.calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some(([col, val]) => col === "status" && val === "payment_pending"));
});

test("releaseFailedHold: nothing to release (guarded UPDATE matches nothing) returns null, not an error", async () => {
  const db = createFakeSupabaseClient({ data: null, error: { code: "PGRST116" } });
  const repo = new AppointmentRepository(db);

  const result = await repo.releaseFailedHold("clinic-1", "appt-1");

  assert.equal(result, null);
});

test("releaseFailedHold: a non-constraint DB error throws DatabaseError instead of being swallowed", async () => {
  const error = { code: "08006", message: "connection failure" };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new AppointmentRepository(db);

  await assert.rejects(() => repo.releaseFailedHold("clinic-1", "appt-1"), DatabaseError);
});
