import test from "node:test";
import assert from "node:assert/strict";
import { SOAPGenerationService } from "../services/soap-generation.service.js";
import { toApiError } from "../errors.js";

test("generate returns 422 insufficient_transcript and does not call the model", async () => {
  let classified = false;
  const service = new SOAPGenerationService(
    {},
    {
      async getGenerationContext() {
        return {
          session: {
            id: "session-1",
            doctor_id: "doctor-1",
            clinic_id: "clinic-1",
            status: "REVIEW_COMPLETED",
          },
          segments: [{ text: "Hello", start_seconds: 0, end_seconds: 1 }],
          latestTranscriptVersion: {
            id: "version-1",
            session_id: "session-1",
            full_text: "Hello",
          },
        };
      },
    },
    {},
    { async generate() { throw new Error("model should not be called"); } },
    { async classify() { classified = true; return []; } },
  );

  await assert.rejects(
    () => service.generate("session-1", {}, { doctorId: "doctor-1", clinicId: "clinic-1" }),
    (err) => {
      assert.equal(err.code, "insufficient_transcript");
      assert.equal(err.statusCode, 422);
      assert.equal(toApiError(err).code, "insufficient_transcript");
      return true;
    },
  );
  assert.equal(classified, false);
});
