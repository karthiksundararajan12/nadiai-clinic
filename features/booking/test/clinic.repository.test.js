import test from "node:test";
import assert from "node:assert/strict";
import { ClinicRepository } from "../repository/clinic.repository.js";

/**
 * Fake query builder that pages through `allRows` PAGE_SIZE at a time via
 * .range(from, to) — mirrors findAllWithWhatsAppConfigured's real
 * pagination loop so tests can exercise more than one page.
 */
class FakePagingQueryBuilder {
  constructor(allRows) {
    this._allRows = allRows;
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
    const page = this._allRows.slice(this._from, this._to + 1);
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  }
}

function createFakePagingClient(allRows) {
  const builders = [];
  return {
    from() {
      const builder = new FakePagingQueryBuilder(allRows);
      builders.push(builder);
      return builder;
    },
    get builders() {
      return builders;
    },
  };
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
