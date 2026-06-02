// @ts-check
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_WAV = join(__dirname, "../fixtures/consultation-sample.wav");

/** @typedef {import('@playwright/test').APIRequestContext} APIRequestContext */

export class ScribeApi {
  /** @param {APIRequestContext} request */
  constructor(request) {
    this.request = request;
  }

  async releaseBlockingSessions() {
    const res = await this.request.post("/api/scribe/sessions/release-blocking", { data: {} });
    if (!res.ok() && res.status() !== 401) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `release-blocking failed (${res.status()})`);
    }
  }

  /**
   * Creates a new consultation session and uploads a short audio fixture.
   * @returns {Promise<string>} session id
   */
  async createConsultationWithAudio(options = {}) {
    const audio = options.audioBuffer ?? await loadConsultationFixture();
    const mimeType = options.mimeType ?? "audio/wav";
    const durationSeconds = options.durationSeconds ?? 8;

    await this.releaseBlockingSessions();

    const manifest = {
      language: options.language ?? "english",
      audio_duration_seconds: durationSeconds,
      audio_size_bytes: audio.length,
      chunks: [
        {
          chunk_index: 0,
          size_bytes: audio.length,
          duration_ms: durationSeconds * 1000,
          mime_type: mimeType,
          checksum: null,
        },
      ],
    };

    const startRes = await this.request.post("/api/scribe/uploads/start", { data: manifest });
    const start = await parseJson(startRes, "uploads/start");
    const sessionId = start.session.id;
    const upload = start.uploads[0];

    const putRes = await fetch(upload.signedUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${upload.token}`,
        "Content-Type": mimeType,
      },
      body: audio,
    });
    if (!putRes.ok) {
      throw new Error(`Storage upload failed (${putRes.status})`);
    }

    await parseJson(
      await this.request.post(`/api/scribe/sessions/${sessionId}/uploads/confirm`, {
        data: { chunk_index: 0, size_bytes: audio.length, checksum: null },
      }),
      "uploads/confirm",
    );

    const finalized = await parseJson(
      await this.request.post(`/api/scribe/sessions/${sessionId}/uploads/finalize`, {
        data: {
          audio_duration_seconds: durationSeconds,
          audio_size_bytes: audio.length,
        },
      }),
      "uploads/finalize",
    );

    return finalized?.session?.id ?? sessionId;
  }

  /**
   * @param {string} sessionId
   * @param {{ timeoutMs?: number }} [options]
   */
  async runTranscriptionUntil(sessionId, targetStatus = "TRANSCRIBED", options = {}) {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    const runRes = await this.request.post(
      `/api/scribe/sessions/${sessionId}/transcription/run`,
      { data: {}, timeout: timeoutMs },
    );
    const runBody = await runRes.json().catch(() => ({}));
    if (runRes.ok() && runBody?.session?.status === targetStatus) {
      return runBody.session;
    }

    while (Date.now() < deadline) {
      const session = await this.getSession(sessionId);
      if (session.status === targetStatus) return session;
      if (session.status === "TRANSCRIPTION_FAILED") {
        throw new Error(`Transcription failed: ${session.error_message ?? "unknown"}`);
      }
      await sleep(3000);
      await this.request.post(`/api/scribe/sessions/${sessionId}/transcription/run`, {
        data: {},
        timeout: 120_000,
      }).catch(() => {});
    }

    throw new Error(`Timed out waiting for session status ${targetStatus}`);
  }

  /** @param {string} sessionId */
  async openTranscriptReview(sessionId) {
    const res = await this.request.get(`/api/scribe/sessions/${sessionId}/review`);
    return parseJson(res, "review workspace");
  }

  /** @param {string} sessionId */
  async completeTranscriptReview(sessionId) {
    const res = await this.request.post(`/api/scribe/sessions/${sessionId}/review/complete`, {
      data: { create_version: true },
    });
    return parseJson(res, "review complete");
  }

  /** @param {string} sessionId */
  async generateSoap(sessionId) {
    const res = await this.request.post(`/api/scribe/sessions/${sessionId}/soap/generate`, {
      data: { force: true },
      timeout: 180_000,
    });
    return parseJson(res, "soap generate");
  }

  /**
   * @param {string} sessionId
   * @param {string[]} acceptable
   */
  async waitForSessionStatus(sessionId, acceptable, timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const session = await this.getSession(sessionId);
      if (acceptable.includes(session.status)) return session;
      await sleep(2000);
    }
    const last = await this.getSession(sessionId);
    throw new Error(`Timed out waiting for ${acceptable.join("|")}, last=${last.status}`);
  }

  /** @param {string} sessionId */
  async getSoapReview(sessionId) {
    const res = await this.request.get(`/api/scribe/sessions/${sessionId}/soap/review`);
    return parseJson(res, "soap review");
  }

  /** @param {string} sessionId */
  async approveSoap(sessionId) {
    const res = await this.request.post(`/api/scribe/sessions/${sessionId}/soap/review/approve`, {
      data: { create_version: true },
    });
    return parseJson(res, "soap approve");
  }

  /** @param {string} sessionId */
  async generatePrescription(sessionId) {
    const res = await this.request.post(`/api/scribe/sessions/${sessionId}/prescription/generate`, {
      data: { force: false },
      timeout: 180_000,
    });
    return parseJson(res, "prescription generate");
  }

  /** @param {string} sessionId */
  async openPrescriptionReview(sessionId) {
    const res = await this.request.get(`/api/scribe/sessions/${sessionId}/prescription/review`);
    return parseJson(res, "prescription review");
  }

  /** @param {string} sessionId */
  async approvePrescription(sessionId) {
    const res = await this.request.post(
      `/api/scribe/sessions/${sessionId}/prescription/review/approve`,
      { data: { create_version: true } },
    );
    return parseJson(res, "prescription approve");
  }

  /** @param {string} sessionId */
  async getSession(sessionId) {
    const res = await this.request.get(`/api/scribe/sessions/${sessionId}`);
    const body = await parseJson(res, "get session");
    return body.session ?? body;
  }

  /** @param {"active"|"history"} bucket */
  async listConsultations(bucket) {
    const res = await this.request.get(
      `/api/scribe/consultations/history?bucket=${bucket}&limit=50`,
    );
    const body = await parseJson(res, `consultations ${bucket}`);
    return body.data ?? [];
  }
}

/** @param {APIRequestContext} request */
export function createScribeApi(request) {
  return new ScribeApi(request);
}

export async function loadConsultationFixture() {
  return readFile(FIXTURE_WAV);
}

/**
 * @param {import('@playwright/test').APIResponse} res
 * @param {string} label
 */
async function parseJson(res, label) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    const hint = body?.code ? ` [${body.code}]` : "";
    throw new Error(`${label} failed (${res.status})${hint}: ${body?.error ?? JSON.stringify(body)}`);
  }
  return body;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
