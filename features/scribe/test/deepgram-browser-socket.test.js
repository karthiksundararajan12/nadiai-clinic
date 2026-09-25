import test from "node:test";
import assert from "node:assert/strict";
import {
  deepgramBrowserProtocols,
  deepgramListenUrl,
} from "../recording/deepgram-browser-socket.js";

test("listen URL targets Deepgram and keeps the grant out of the query string", () => {
  const { url, model } = deepgramListenUrl("english");
  const parsed = new URL(url);

  assert.equal(parsed.protocol, "wss:");
  assert.equal(parsed.host, "api.deepgram.com");
  assert.equal(parsed.pathname, "/v1/listen");
  assert.equal(model, "nova-2-medical");
  assert.equal(parsed.searchParams.get("model"), "nova-2-medical");
  assert.equal(parsed.searchParams.get("language"), "en");
  assert.equal(parsed.searchParams.get("interim_results"), "true");
  assert.equal(parsed.searchParams.get("diarize"), "true");
  assert.equal(parsed.searchParams.get("token"), null);
  assert.equal(parsed.searchParams.get("access_token"), null);
});

test("browser handshake uses the bearer subprotocol, not the API key", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.payload.sig";
  assert.deepEqual(deepgramBrowserProtocols(jwt), ["bearer", jwt]);
});
