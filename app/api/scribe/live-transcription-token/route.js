/**
 * POST /api/scribe/live-transcription-token
 *
 * Mints a 30-second Deepgram grant for the signed-in doctor. The browser
 * uses it once, on the Listen WebSocket handshake. DEEPGRAM_API_KEY stays here.
 */

import { NextResponse } from "next/server";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { scribeLogger } from "@/features/scribe/client";

const log = scribeLogger.child({ component: "API /api/scribe/live-transcription-token" });

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
/** Deepgram's default. Their maximum is 3600; we never request or return that. */
const TTL_SECONDS = 30;
const MAX_ACCEPTED_TTL_SECONDS = 60;

export async function POST(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Live transcription is not configured" },
        { status: 503 },
      );
    }

    const grant = await fetch(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
      cache: "no-store",
    });

    const payload = await grant.json().catch(() => ({}));
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    const expiresIn = Number(payload.expires_in);

    if (
      !grant.ok ||
      !accessToken ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      expiresIn > MAX_ACCEPTED_TTL_SECONDS
    ) {
      log.error("Deepgram token grant failed", {
        status: grant.status,
        expiresIn: payload?.expires_in ?? null,
      });
      return NextResponse.json(
        { error: "Live transcription token failed" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { access_token: accessToken, expires_in: expiresIn },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    log.error("POST /api/scribe/live-transcription-token failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Live transcription token failed" },
      { status: 500 },
    );
  }
}
