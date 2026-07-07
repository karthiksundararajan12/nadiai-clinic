import test from "node:test";
import assert from "node:assert/strict";
import { RazorpayWebhookEventRepository } from "../repository/razorpay-webhook-event.repository.js";
import { DatabaseError } from "../errors.js";

class FakeInsertBuilder {
  constructor(result) {
    this._result = result;
    this.insertedData = null;
  }
  insert(data) {
    this.insertedData = data;
    return this;
  }
  then(resolve, reject) {
    return Promise.resolve(this._result).then(resolve, reject);
  }
}

function createFakeSupabaseClient(result) {
  const builders = [];
  return {
    from() {
      const builder = new FakeInsertBuilder(result);
      builders.push(builder);
      return builder;
    },
    get lastBuilder() {
      return builders[builders.length - 1];
    },
  };
}

test("recordIfNew: first time seeing an event id inserts it and returns true", async () => {
  const db = createFakeSupabaseClient({ data: null, error: null });
  const repo = new RazorpayWebhookEventRepository(db);

  const result = await repo.recordIfNew("evt_1", "payment.captured", { foo: "bar" });

  assert.equal(result, true);
  assert.deepEqual(db.lastBuilder.insertedData, {
    event_id: "evt_1",
    event_type: "payment.captured",
    payload: { foo: "bar" },
  });
});

test("recordIfNew: a unique violation on event_id is a replay — returns false, does not throw", async () => {
  const error = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "razorpay_webhook_events_event_id_key"',
  };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new RazorpayWebhookEventRepository(db);

  const result = await repo.recordIfNew("evt_1", "payment.captured", {});

  assert.equal(result, false);
});

test("recordIfNew: a non-constraint DB error throws DatabaseError instead of being swallowed", async () => {
  const error = { code: "08006", message: "connection failure" };
  const db = createFakeSupabaseClient({ data: null, error });
  const repo = new RazorpayWebhookEventRepository(db);

  await assert.rejects(() => repo.recordIfNew("evt_1", "payment.captured", {}), DatabaseError);
});

test("recordIfNew: a null payload is stored as null, not undefined", async () => {
  const db = createFakeSupabaseClient({ data: null, error: null });
  const repo = new RazorpayWebhookEventRepository(db);

  await repo.recordIfNew("evt_1", "payment.captured", undefined);

  assert.equal(db.lastBuilder.insertedData.payload, null);
});
