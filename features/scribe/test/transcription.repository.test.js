import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionRepository } from "../repository/transcription.repository.js";
import { DatabaseError } from "../errors.js";
import { JOB_STATUS, JOB_TYPE } from "../constants.js";

/**
 * @param {{
 *   findActiveResults?: Array<Record<string, unknown>|null>;
 *   insertError?: { code: string }|null;
 * }} config
 */
function mockSupabase(config = {}) {
  const findQueue = [...(config.findActiveResults ?? [null])];
  return {
    from(table) {
      if (table !== "scribe_processing_queue") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        update() {
          const chain = { eq() { return chain; }, lt: async () => ({ error: null }) };
          return chain;
        },
        insert(row) {
          return {
            select() {
              return {
                single: async () => {
                  if (config.insertError) return { data: null, error: config.insertError };
                  return {
                    data: {
                      id: "job-new",
                      ...row,
                      status: JOB_STATUS.PENDING,
                      job_type: JOB_TYPE.TRANSCRIBE,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          const chain = {
            eq() { return chain; },
            in() { return chain; },
            order() { return chain; },
            limit() {
              return {
                single: async () => {
                  const data = findQueue.length ? findQueue.shift() : null;
                  return {
                    data,
                    error: data ? null : { code: "PGRST116" },
                  };
                },
              };
            },
          };
          return chain;
        },
      };
    },
  };
}

test("enqueue returns existing active job without insert", async () => {
  const existing = { id: "job-1", session_id: "sess-1", status: JOB_STATUS.PENDING };
  const repo = new TranscriptionRepository(mockSupabase({
    findActiveResults: [existing],
  }));
  const result = await repo.enqueue({ sessionId: "sess-1" });

  assert.equal(result.created, false);
  assert.equal(result.job.id, "job-1");
});

test("enqueue creates job when none exists", async () => {
  const repo = new TranscriptionRepository(mockSupabase({ findActiveResults: [null] }));
  const result = await repo.enqueue({ sessionId: "sess-1", priority: 7 });

  assert.equal(result.created, true);
  assert.equal(result.job.id, "job-new");
});

test("enqueue returns duplicate job after unique violation", async () => {
  const existing = { id: "job-dup", session_id: "sess-1", status: JOB_STATUS.PENDING };
  const repo = new TranscriptionRepository(mockSupabase({
    findActiveResults: [null, existing],
    insertError: { code: "23505" },
  }));
  const result = await repo.enqueue({ sessionId: "sess-1" });

  assert.equal(result.created, false);
  assert.equal(result.job.id, "job-dup");
});

test("enqueue throws DatabaseError on non-duplicate failures", async () => {
  const repo = new TranscriptionRepository(mockSupabase({
    findActiveResults: [null, null],
    insertError: { code: "42501" },
  }));

  await assert.rejects(
    () => repo.enqueue({ sessionId: "sess-1" }),
    DatabaseError,
  );
});
