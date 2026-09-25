import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core.js");
const presetReact = require("next/dist/compiled/babel/preset-react.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../");

function resolveAlias(specifier) {
  const base = join(ROOT, specifier.slice(2));
  const candidates = [base, `${base}.js`, `${base}.jsx`, join(base, "index.js")];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`Cannot resolve ${specifier}`);
  }
  return pathToFileURL(match).href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return { shortCircuit: true, url: resolveAlias(specifier) };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".jsx")) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const result = babel.transformSync(source, {
      filename: fileURLToPath(url),
      babelrc: false,
      configFile: false,
      presets: [[presetReact, { runtime: "automatic" }]],
      sourceMaps: "inline",
    });
    return { format: "module", source: result.code, shortCircuit: true };
  },
});

const window = new Window({ url: "http://localhost/scribe" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
window.HTMLElement.prototype.scrollIntoView = () => {};

const { createRoot } = await import("react-dom/client");
const { act, createElement } = await import("react");
const { ScribeRecordPanel } = await import("./ScribeRecordPanel.jsx");
const { LiveTranscriptPanel } = await import("./LiveTranscriptPanel.jsx");

const SEGMENTS = [
  { id: "s1", speaker_label: "Doctor", text: "How long have you had the fever?", start_seconds: 1 },
  { id: "s2", speaker_label: "Patient", text: "About three days now.", start_seconds: 4 },
];

function render(Component, props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Component, props));
  });
  return {
    host,
    rerender(nextProps) {
      act(() => {
        root.render(createElement(Component, nextProps));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function conversationArea(host) {
  return host.querySelector("[data-testid='record-panel-conversation']");
}

for (const recordState of ["recording", "paused", "requesting"]) {
  test(`conversation area stays empty while ${recordState}, even if segments exist`, async () => {
    const view = render(ScribeRecordPanel, {
      recordState,
      transcriptSegments: SEGMENTS,
    });
    try {
      const area = conversationArea(view.host);
      assert.ok(area);
      assert.equal(area.querySelector("[data-testid='transcript-review-workspace']"), null);
      assert.ok(area.querySelector("[data-testid='conversation-placeholder']"));
      assert.match(area.textContent, /Transcript will appear here/);
      assert.equal(area.textContent.includes("How long have you had the fever?"), false);
      assert.equal(view.host.querySelector("[data-testid='live-interim-transcript']"), null);
    } finally {
      await view.unmount();
    }
  });
}

test("conversation area renders the full transcript below the record button after recording stops", async () => {
  const view = render(ScribeRecordPanel, {
    recordState: "recording",
    transcriptSegments: SEGMENTS,
  });
  try {
    assert.equal(view.host.textContent.includes("About three days now."), false);

    view.rerender({ recordState: "idle", transcriptSegments: SEGMENTS });

    const area = conversationArea(view.host);
    const workspace = area.querySelector("[data-testid='transcript-review-workspace']");
    assert.ok(workspace);
    assert.equal(area.querySelector("[data-testid='conversation-placeholder']"), null);
    assert.match(workspace.textContent, /How long have you had the fever\?/);
    assert.match(workspace.textContent, /About three days now\./);

    const startButton = view.host.querySelector("button[aria-label='Start recording']");
    assert.ok(startButton);
    assert.ok(
      startButton.compareDocumentPosition(area) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      "conversation area should follow the Start Recording button",
    );
  } finally {
    await view.unmount();
  }
});

test("processing spinner is suppressed while recording and shown after stop", async () => {
  const view = render(ScribeRecordPanel, {
    recordState: "recording",
    transcriptLoading: true,
    transcriptLoadingMessage: "Transcribing…",
  });
  try {
    assert.equal(view.host.textContent.includes("Transcribing…"), false);
    view.rerender({
      recordState: "processing",
      transcriptLoading: true,
      transcriptLoadingMessage: "Transcribing…",
    });
    assert.match(conversationArea(view.host).textContent, /Transcribing…/);
  } finally {
    await view.unmount();
  }
});

test("unapproved open session still offers New Session instead of a dead end", async () => {
  let clicked = 0;
  const view = render(ScribeRecordPanel, {
    recordState: "idle",
    disabled: true,
    canStartNewSession: true,
    sessionContext: "in-progress",
    onNewSession: () => { clicked += 1; },
  });
  try {
    assert.match(view.host.textContent, /Session in progress/);
    assert.equal(view.host.querySelector("button[aria-label='Start recording']"), null);
    const newSession = [...view.host.querySelectorAll("button")].find((b) =>
      b.textContent.includes("New Session"),
    );
    assert.ok(newSession, "New Session button must be available for unapproved sessions");
    await act(async () => {
      newSession.click();
    });
    assert.equal(clicked, 1);
  } finally {
    await view.unmount();
  }
});

test("recorder status strip shows mic state but never live transcript text", async () => {
  const view = render(LiveTranscriptPanel, {
    micState: "recording",
    liveStatus: "live",
    segments: SEGMENTS,
  });
  try {
    const panel = view.host.querySelector("[data-testid='live-transcript-panel']");
    assert.ok(panel);
    assert.match(panel.querySelector("[role='status']").textContent, /Recording/);
    assert.equal(panel.querySelector("[data-testid='transcript-review-workspace']"), null);
    assert.equal(panel.textContent.includes("How long have you had the fever?"), false);
  } finally {
    await view.unmount();
  }
});
