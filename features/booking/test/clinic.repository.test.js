import test from "node:test";
import assert from "node:assert/strict";
import { ClinicRepository } from "../repository/clinic.repository.js";
import { DatabaseError } from "../errors.js";

/**
 * Fake query builder that pages through `allRows` PAGE_SIZE at a time via
 * .range(from, to) — mirrors findAllWithWhatsAppConfigured's real
 * pagination loop so tests can exercise more than one page.
 */
class FakePagingQueryBuilder {
  constructor(allRows, { shouldFail = false, error = null } = {}) {
    this._allRows = allRows;
    this._shouldFail = shouldFail;
    this._error = error;
    this.calls = [];
  }

  _record(method, args) {
    this.calls.push({ method, args });
    return this;
  }

  select(...args) { return this._record("select", args); }
  not(...args) { return this._record("not", args); }
  order(...args) { return this._record("order", args); }
  range(from, to) {
    this._record("range", [from, to]);
    this._from = from;
    this._to = to;
    return this;
  }

  then(resolve, reject) {
    if (this._shouldFail) {
      return Promise.resolve({ data: null, error: this._error }).then(resolve, reject);
    }
    const page = this._allRows.slice(this._from, this._to + 1);
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  }
}

function createFakePagingClient(allRows, { failuresBeforeSuccess = 0, error = null } = {}) {
  const builders = [];
  let remainingFailures = failuresBeforeSuccess;
  const dbError = error ?? { message: "connection reset", code: "08006" };
  return {
    from() {
      const shouldFail = remainingFailures > 0;
      if (shouldFail) remainingFailures -= 1;
      const builder = new FakePagingQueryBuilder(allRows, {
        shouldFail,
        error: dbError,
      });
      builders.push(builder);
      return builder;
    },
    get builders() {
      return builders;
    },
    get remainingFailures() {
      return remainingFailures;
    },
  };
}

/** Capture structured logger lines written via console.error (warn + error). */
function captureStructuredLogs(fn) {
  const lines = [];
  const original = console.error;
  console.error = (line) => {
    try {
      lines.push(typeof line === "string" ? JSON.parse(line) : line);
    } catch {
      lines.push({ raw: line });
    }
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then((result) => ({ result, lines }));
}

test("findAllWithWhatsAppConfigured: returns every row on a single page", async () => {
  const rows = [
    { id: "clinic-1", whatsapp_phone_number_id: "PNID_1", reminder_24h_offset_minutes: 1440, reminder_2h_offset_minutes: 120 },
    { id: "clinic-2", whatsapp_phone_number_id: "PNID_2", reminder_24h_offset_minutes: 1440, reminder_2h_offset_minutes: 120 },
  ];
  const db = createFakePagingClient(rows);
  const repo = new ClinicRepository(db);

  const result = await repo.findAllWithWhatsAppConfigured();

  assert.deepEqual(result, rows);
  assert.equal(db.builders.length, 1, "a single page should stop after one request");
  const notArgs = db.builders[0].calls.find((c) => c.method === "not")?.args;
  assert.deepEqual(notArgs, ["whatsapp_phone_number_id", "is", null]);
});

test("findAllWithWhatsAppConfigured: pages through results larger than one page", async () => {
  const rows = Array.from({ length: 750 }, (_, i) => ({
    id: `clinic-${i}`,
    whatsapp_phone_number_id: `PNID_${i}`,
    reminder_24h_offset_minutes: 1440,
    reminder_2h_offset_minutes: 120,
  }));
  const db = createFakePagingClient(rows);
  const repo = new ClinicRepository(db);

  const result = await repo.findAllWithWhatsAppConfigured();

  assert.equal(result.length, 750);
  assert.deepEqual(result, rows);
  assert.equal(db.builders.length, 2, "750 rows at a 500-row page size should take exactly 2 requests");
});

test("findAllWithWhatsAppConfigured: empty table returns an empty array without looping forever", async () => {
  const db = createFakePagingClient([]);
  const repo = new ClinicRepository(db);

  const result = await repo.findAllWithWhatsAppConfigured();

  assert.deepEqual(result, []);
  assert.equal(db.builders.length, 1);
});

test("findAllWithWhatsAppConfigured: retries once on DB error then succeeds (one warn, zero errors)", async () => {
  const rows = [
    { id: "clinic-1", whatsapp_phone_number_id: "PNID_1", reminder_24h_offset_minutes: 1440, reminder_2h_offset_minutes: 120 },
  ];
  const db = createFakePagingClient(rows, { failuresBeforeSuccess: 1 });
  const repo = new ClinicRepository(db);

  const { result, lines } = await captureStructuredLogs(() =>
    repo.findAllWithWhatsAppConfigured(),
  );

  assert.deepEqual(result, rows);
  assert.equal(db.builders.length, 2, "first attempt fails, second succeeds");

  const warns = lines.filter((l) => l.level === "warn");
  const errors = lines.filter((l) => l.level === "error");
  assert.equal(warns.length, 1, "exactly one warning before retry");
  assert.equal(errors.length, 0, "no error log when retry recovers");
  assert.equal(warns[0].service, "nadi-ai-booking");
  assert.equal(warns[0].component, "ReminderService");
  assert.match(warns[0].message, /retrying once/i);
});

test("findAllWithWhatsAppConfigured: fails twice — throws and logs error (no infinite retry)", async () => {
  const db = createFakePagingClient([], { failuresBeforeSuccess: 2 });
  const repo = new ClinicRepository(db);

  const { result, lines } = await captureStructuredLogs(async () => {
    await assert.rejects(
      () => repo.findAllWithWhatsAppConfigured(),
      (err) => err instanceof DatabaseError,
    );
    return null;
  });

  assert.equal(result, null);
  assert.equal(db.builders.length, 2, "exactly two attempts — no infinite retry");
  assert.equal(db.remainingFailures, 0);

  const warns = lines.filter((l) => l.level === "warn");
  const errors = lines.filter((l) => l.level === "error");
  assert.equal(warns.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].service, "nadi-ai-booking");
  assert.equal(errors[0].component, "ReminderService");
  assert.match(errors[0].message, /failed after retry/i);
});
