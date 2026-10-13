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

/**
 * In-memory transcription_segments with separate-statement autocommit.
 * delete() publishes an empty set immediately. rpc() keeps the previous
 * rows visible until the call commits, then swaps in the replacement.
 */
function createRacingSegmentClient(initialRows) {
  let visible = initialRows.map((row) => ({ ...row }));
  /** @type {Array<Array<Record<string, unknown>>>} */
  const reads = [];
  /** @type {string[]} */
  const mutations = [];
  let releaseInFlight = () => {};
  const inFlight = new Promise((resolve) => {
    releaseInFlight = resolve;
  });
  let markStarted = () => {};
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });

  function snapshot() {
    return visible.map((row) => ({ ...row }));
  }

  function commitReplacement(args) {
    const incoming = Array.isArray(args.p_segments) ? args.p_segments : [];
    const keptIndexes = new Set(incoming.map((segment) => segment.segment_index));
    const byIndex = new Map(
      visible
        .filter((row) => row.transcription_id === args.p_transcription_id)
        .map((row) => [row.segment_index, row]),
    );

    const next = visible.filter(
      (row) => row.transcription_id !== args.p_transcription_id,
    );
    for (const segment of incoming) {
      const previous = byIndex.get(segment.segment_index);
      next.push({
        ...segment,
        id: previous?.id ?? `new-${segment.segment_index}`,
        transcription_id: args.p_transcription_id,
        session_id: args.p_session_id,
      });
    }
    visible = next.filter(
      (row) =>
        row.transcription_id !== args.p_transcription_id ||
        keptIndexes.has(row.segment_index),
    );
  }

  return {
    reads,
    mutations,
    started,
    release: () => releaseInFlight(),
    client: {
      from(table) {
        if (table !== "transcription_segments") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          delete() {
            mutations.push("delete");
            return {
              eq(_column, transcriptionId) {
                visible = visible.filter((row) => row.transcription_id !== transcriptionId);
                markStarted();
                return inFlight.then(() => ({ data: null, error: null }));
              },
            };
          },
          insert(rows) {
            mutations.push("insert");
            visible = visible.concat(rows);
            return {
              select() {
                return {
                  order() {
                    return Promise.resolve({
                      data: snapshot().sort((a, b) => a.segment_index - b.segment_index),
                      error: null,
                    });
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(_column, sessionId) {
                return {
                  order() {
                    const data = snapshot()
                      .filter((row) => row.session_id === sessionId)
                      .sort((a, b) => a.segment_index - b.segment_index);
                    reads.push(data);
                    return Promise.resolve({ data, error: null });
                  },
                };
              },
            };
          },
        };
      },
      rpc(name, args) {
        if (name !== "replace_transcription_segments") {
          return Promise.resolve({
            data: null,
            error: { code: "PGRST202", message: name },
          });
        }
        mutations.push("rpc");
        markStarted();
        return inFlight.then(() => {
          commitReplacement(args);
          const data = snapshot()
            .filter((row) => row.transcription_id === args.p_transcription_id)
            .sort((a, b) => b.segment_index - a.segment_index);
          return { data, error: null };
        });
      },
    },
  };
}

test("concurrent read during replaceSegments never returns an empty set", async () => {
  const store = createRacingSegmentClient([
    {
      id: "seg-0",
      transcription_id: "tx-1",
      session_id: "sess-1",
      segment_index: 0,
      text: "old a",
    },
    {
      id: "seg-1",
      transcription_id: "tx-1",
      session_id: "sess-1",
      segment_index: 1,
      text: "old b",
    },
    {
      id: "seg-2",
      transcription_id: "tx-1",
      session_id: "sess-1",
      segment_index: 2,
      text: "old c",
    },
  ]);
  const repo = new TranscriptionRepository(store.client);
  const pending = repo.replaceSegments("tx-1", "sess-1", [
    {
      segment_index: 0,
      start_seconds: 0,
      end_seconds: 1,
      text: "new a",
      speaker: "A",
      speaker_label: "Doctor",
      confidence: 0.9,
      is_low_confidence: false,
    },
    {
      segment_index: 1,
      start_seconds: 1,
      end_seconds: 2,
      text: "new b",
      speaker: "B",
      speaker_label: "Patient",
      confidence: 0.8,
      is_low_confidence: false,
    },
  ]);

  await store.started;
  const during = await repo.getSegments("sess-1");
  assert.ok(during.length > 0, "concurrent read observed an empty segment set");
  assert.deepEqual(
    during.map((row) => row.text),
    ["old a", "old b", "old c"],
  );

  store.release();
  const replaced = await pending;
  const after = await repo.getSegments("sess-1");

  assert.deepEqual(store.mutations, ["rpc"]);
  assert.ok(store.reads.every((rows) => rows.length > 0));
  assert.deepEqual(
    replaced.map((row) => [row.segment_index, row.text, row.id]),
    [
      [0, "new a", "seg-0"],
      [1, "new b", "seg-1"],
    ],
  );
  assert.equal(after.length, 2);
  assert.equal(after.some((row) => row.segment_index === 2), false);
});
