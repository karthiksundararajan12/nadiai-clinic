/**
 * Attaches a WebSocket upgrade handler for live Deepgram relay.
 * Patches Node's HTTP server so this works with `next dev` / `next start`
 * (App Router has no native WebSocket route yet).
 */

import http from "node:http";
import https from "node:https";
import { parse } from "node:url";
import { WebSocketServer } from "ws";
import { createServerClient } from "@supabase/ssr";
import { LIVE_TRANSCRIPTION } from "../constants.js";
import { attachLiveTranscriptionRelay } from "./live-transcription-relay.js";
import { createLogger } from "../logger.js";

const log = createLogger({ component: "LiveTranscriptionWsServer" });

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket, req) => {
  const { query } = parse(req.url || "", true);
  attachLiveTranscriptionRelay(socket, {
    language: typeof query.language === "string" ? query.language : undefined,
  });
});

/**
 * @param {import('http').IncomingMessage} req
 */
async function isAuthenticatedDoctor(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !url.startsWith("http")) return false;

  const cookies = parseCookieHeader(req.headers.cookie);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookies;
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .single();

  return Boolean(profile);
}

function parseCookieHeader(header) {
  if (!header) return [];
  return header.split(";").flatMap((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return [];
    return [{ name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }];
  });
}

function pathnameOf(req) {
  return String(req.url ?? "").split("?")[0];
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('stream').Duplex} socket
 * @param {Buffer} head
 */
export function handleLiveTranscriptionUpgrade(req, socket, head) {
  void (async () => {
    try {
      const ok = await isAuthenticatedDoctor(req);
      if (!ok) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      log.error("Live transcription upgrade failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      } catch {
        /* ignore */
      }
      socket.destroy();
    }
  })();
}

export function attachLiveTranscriptionUpgrade() {
  patchEmit(http.Server);
  patchEmit(https.Server);
  log.info("Live transcription WebSocket upgrade attached", {
    path: LIVE_TRANSCRIPTION.PATH,
  });
}

function patchEmit(Server) {
  const original = Server.prototype.emit;
  if (original.__scribeLivePatched) return;

  function patched(event, ...args) {
    if (event === "upgrade") {
      const req = args[0];
      if (pathnameOf(req) === LIVE_TRANSCRIPTION.PATH) {
        handleLiveTranscriptionUpgrade(req, args[1], args[2]);
        return true;
      }
    }
    return original.call(this, event, ...args);
  }

  patched.__scribeLivePatched = true;
  Server.prototype.emit = patched;
}
