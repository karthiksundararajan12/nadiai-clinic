import test from "node:test";
import assert from "node:assert/strict";
import { alertOps, sendToOpsChannel, OPS_ALERT_STEP } from "../lib/alerting.js";

const ENV_KEYS = [
  "OPS_ALERT_SLACK_WEBHOOK_URL",
  "OPS_ALERT_WHATSAPP_TO",
  "OPS_ALERT_WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "META_PHONE_NUMBER_ID",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("sendToOpsChannel: no channel configured — returns sent:false without calling fetch", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };

  try {
    const result = await sendToOpsChannel("test message");
    assert.deepEqual(result, { sent: false, channel: "none" });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("sendToOpsChannel: Slack webhook configured — posts { text } to the webhook URL", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.OPS_ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T0/B0/xyz";

  const originalFetch = globalThis.fetch;
  let seenUrl;
  let seenBody;
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenBody = JSON.parse(String(init.body));
    return { ok: true, status: 200 };
  };

  try {
    const result = await sendToOpsChannel("hello ops");
    assert.equal(seenUrl, "https://hooks.slack.com/services/T0/B0/xyz");
    assert.equal(seenBody.text, "hello ops");
    assert.deepEqual(result, { sent: true, channel: "slack" });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("sendToOpsChannel: Slack webhook takes priority over WhatsApp when both are configured", async () => {
  const snapshot = snapshotEnv();
  process.env.OPS_ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T0/B0/xyz";
  process.env.OPS_ALERT_WHATSAPP_TO = "919876543210";
  process.env.WHATSAPP_ACCESS_TOKEN = "token";
  process.env.META_PHONE_NUMBER_ID = "phone-1";

  const originalFetch = globalThis.fetch;
  const seenUrls = [];
  globalThis.fetch = async (url) => {
    seenUrls.push(String(url));
    return { ok: true, status: 200 };
  };

  try {
    const result = await sendToOpsChannel("hello");
    assert.equal(result.channel, "slack");
    assert.equal(seenUrls.length, 1);
    assert.ok(seenUrls[0].includes("hooks.slack.com"));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("sendToOpsChannel: WhatsApp channel configured — posts a text message via the Graph API using META_PHONE_NUMBER_ID fallback", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.OPS_ALERT_WHATSAPP_TO = "919876543210";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.META_PHONE_NUMBER_ID = "phone-42";

  const originalFetch = globalThis.fetch;
  let seenUrl;
  let seenInit;
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenInit = init;
    return { ok: true, status: 200 };
  };

  try {
    const result = await sendToOpsChannel("hello whatsapp");
    assert.ok(seenUrl.includes("/phone-42/messages"));
    assert.equal(seenInit.headers.Authorization, "Bearer test-token");
    const body = JSON.parse(String(seenInit.body));
    assert.equal(body.to, "919876543210");
    assert.equal(body.text.body, "hello whatsapp");
    assert.deepEqual(result, { sent: true, channel: "whatsapp" });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("sendToOpsChannel: a failed delivery is caught and reported as sent:false, never throws", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.OPS_ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T0/B0/xyz";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });

  try {
    const result = await sendToOpsChannel("hello");
    assert.deepEqual(result, { sent: false, channel: "slack" });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("alertOps: never throws even when the channel and the ops_alerts DB write both fail", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.OPS_ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T0/B0/xyz";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  try {
    await assert.doesNotReject(() =>
      alertOps({
        title: "Test failure",
        step: OPS_ALERT_STEP.VACCINATION_SEED,
        error: new Error("boom"),
        clinicId: "clinic-1",
        patientId: "patient-1",
        contactPhone: "919876543210",
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("alertOps: no channel configured still resolves without throwing (logged-only degradation)", async () => {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];

  try {
    await assert.doesNotReject(() =>
      alertOps({ step: OPS_ALERT_STEP.WHATSAPP_SEND, error: new Error("send failed") }),
    );
  } finally {
    restoreEnv(snapshot);
  }
});
