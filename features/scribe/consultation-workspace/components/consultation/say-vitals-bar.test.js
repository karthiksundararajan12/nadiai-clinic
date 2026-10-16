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
  if (!match) throw new Error(`Cannot resolve ${specifier}`);
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
globalThis.Blob = window.Blob;
globalThis.FormData = window.FormData;
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
globalThis.AudioContext = class {
  createMediaStreamSource() {
    return { connect() {} };
  }

  createAnalyser() {
    return {
      fftSize: 1024,
      getByteTimeDomainData(buffer) {
        buffer.fill(128);
      },
    };
  }

  close() {
    return Promise.resolve();
  }
};
globalThis.MediaRecorder = class {
  constructor() {
    this.state = "inactive";
    this.mimeType = "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new window.Blob(["vitals"], { type: "audio/webm" }) });
    this.onstop?.();
  }
};

const { createRoot } = await import("react-dom/client");
const { act, createElement } = await import("react");
const { NextIntlClientProvider } = await import("next-intl");
const { SayVitalsBar } = await import("./SayVitalsBar.jsx");
const messages = JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8"));

const SAVED_VITALS = {
  bp_systolic: 120,
  bp_diastolic: 80,
  pulse: 78,
  spo2: 98,
  temp: null,
  weight: null,
  height: null,
  sugar: null,
  sugar_unit: null,
  sugar_type: null,
  heard_text: "BP 120 by 80",
};

function renderBar(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  let current = props;
  function draw() {
    act(() => {
      root.render(createElement(
        NextIntlClientProvider,
        { locale: "en", messages },
        createElement(SayVitalsBar, current),
      ));
    });
  }
  draw();
  return {
    host,
    rerender(next) {
      current = { ...current, ...next };
      draw();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function setInput(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor.set.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function installFetch({ vitals = null, onSave } = {}) {
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes("/api/scribe/vitals/hear")) {
      return {
        ok: true,
        async json() {
          return {
            transcript: "BP 120 by 80, pulse seventy eight, SpO2 ninety eight",
            vitals: {
              bp_systolic: 120,
              bp_diastolic: 80,
              pulse: 78,
              spo2: 98,
            },
          };
        },
      };
    }
    if (href.includes("/api/scribe/visit-vitals") && init?.method === "PUT") {
      const body = JSON.parse(init.body);
      onSave?.(body);
      return { ok: true, async json() { return { ok: true }; } };
    }
    if (href.includes("/api/scribe/visit-vitals")) {
      return { ok: true, async json() { return { vitals }; } };
    }
    throw new Error(`Unexpected fetch ${href}`);
  };
}

test("vitals modal opens from Add vitals and closes back to that button", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  window.confirm = () => {
    throw new Error("clean close should not ask to discard");
  };
  installFetch();
  const view = renderBar({ patientId: "patient-1" });
  try {
    await flush();
    assert.equal(document.querySelector("[aria-label='Pulse']"), null);
    assert.equal(document.body.textContent.includes("+ Add vitals"), true);

    const trigger = document.querySelector("[data-testid='vitals-summary']");
    await act(async () => {
      trigger.click();
    });
    await flush();

    const dialog = document.querySelector("[data-testid='vitals-modal']");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(document.body.textContent.includes("Vitals"), true);
    assert.equal(document.body.textContent.includes("Select type"), true);
    assert.equal(document.activeElement?.getAttribute("data-testid"), "vitals-mic");
    assert.equal(document.querySelector("[data-testid='vitals-heard']")?.getAttribute("aria-live"), "polite");

    await act(async () => {
      document.querySelector("[data-testid='vitals-cancel']").click();
    });
    await flush();

    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(document.body.textContent.includes("+ Add vitals"), true);
  } finally {
    window.confirm = originalConfirm;
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("Add vitals stays disabled until a patient is selected", async () => {
  const originalFetch = globalThis.fetch;
  installFetch();
  const view = renderBar({ patientId: null });
  try {
    const trigger = document.querySelector("[data-testid='vitals-summary']");
    assert.equal(trigger.disabled, true);
    await act(async () => {
      trigger.click();
    });
    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);
  } finally {
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("voice autofill inside the modal keeps a typed value until Replace", async () => {
  const originalFetch = globalThis.fetch;
  installFetch();
  navigator.mediaDevices = {
    async getUserMedia() {
      return { getTracks() { return [{ stop() {} }]; } };
    },
  };
  const view = renderBar({ patientId: "patient-1" });
  try {
    await flush();
    await act(async () => {
      document.querySelector("[data-testid='vitals-summary']").click();
    });
    await flush();

    const pulse = document.querySelector("[aria-label='Pulse']");
    await act(async () => {
      setInput(pulse, "90");
    });

    await act(async () => {
      document.querySelector("[data-testid='vitals-mic']").click();
    });
    await flush();
    await act(async () => {
      document.querySelector("[data-testid='vitals-stop']").click();
    });
    await flush();

    assert.equal(document.querySelector("[aria-label='BP systolic']").value, "120");
    assert.equal(document.querySelector("[aria-label='BP diastolic']").value, "80");
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "90");
    assert.equal(document.querySelector("[aria-label='SpO2']").value, "98");
    assert.match(document.querySelector("[data-testid='vitals-heard']").textContent, /Heard: BP 120 by 80/);
    assert.equal(document.body.textContent.includes("Replace"), true);

    const replace = [...document.querySelectorAll("button")].find((button) => button.textContent === "Replace");
    await act(async () => {
      replace.click();
    });
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "78");
  } finally {
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("Save vitals writes the visit and updates the summary chip", async () => {
  const originalFetch = globalThis.fetch;
  const saved = [];
  installFetch({ onSave: (body) => saved.push(body) });
  const view = renderBar({ patientId: "patient-1", appointmentId: "appt-1" });
  try {
    await flush();
    await act(async () => {
      document.querySelector("[data-testid='vitals-summary']").click();
    });
    await flush();
    await act(async () => {
      setInput(document.querySelector("[aria-label='BP systolic']"), "120");
      setInput(document.querySelector("[aria-label='BP diastolic']"), "80");
      setInput(document.querySelector("[aria-label='Pulse']"), "78");
      setInput(document.querySelector("[aria-label='SpO2']"), "98");
    });
    await act(async () => {
      document.querySelector("[data-testid='vitals-save']").click();
    });
    await flush();

    assert.equal(saved.length, 1);
    assert.equal(saved[0].patientId, "patient-1");
    assert.equal(saved[0].bp_systolic, "120");
    assert.equal(saved[0].pulse, "78");
    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);
    assert.match(
      document.querySelector("[data-testid='vitals-summary']").textContent,
      /BP 120\/80 · Pulse 78 · SpO2 98%/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("Cancel discards unsaved vitals after confirm", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  let confirmed = 0;
  window.confirm = () => {
    confirmed += 1;
    return true;
  };
  installFetch();
  const view = renderBar({ patientId: "patient-1" });
  try {
    await flush();
    await act(async () => {
      document.querySelector("[data-testid='vitals-summary']").click();
    });
    await flush();
    await act(async () => {
      setInput(document.querySelector("[aria-label='Pulse']"), "90");
    });
    await act(async () => {
      document.querySelector("[data-testid='vitals-cancel']").click();
    });
    await flush();

    assert.equal(confirmed, 1);
    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);
    assert.match(document.querySelector("[data-testid='vitals-summary']").textContent, /\+ Add vitals/);

    await act(async () => {
      document.querySelector("[data-testid='vitals-summary']").click();
    });
    await flush();
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "");
  } finally {
    window.confirm = originalConfirm;
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("reload shows the saved vitals summary before the modal opens", async () => {
  const originalFetch = globalThis.fetch;
  installFetch({ vitals: SAVED_VITALS });
  const view = renderBar({ patientId: "patient-1" });
  try {
    await flush();
    const trigger = document.querySelector("[data-testid='vitals-summary']");
    assert.match(trigger.textContent, /BP 120\/80 · Pulse 78 · SpO2 98%/);
    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);

    await act(async () => {
      trigger.click();
    });
    await flush();
    assert.equal(document.querySelector("[aria-label='BP systolic']").value, "120");
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "78");
    assert.equal(document.querySelector("[aria-label='Sugar type']").value, "");
  } finally {
    globalThis.fetch = originalFetch;
    await view.unmount();
  }
});

test("spoken consultation vitals fill the chip, keep a manual edit, and survive reload", async () => {
  const originalFetch = globalThis.fetch;
  const saved = [];
  const sample = "BP 120 over 80, pulse 78, temp 98.6, SpO2 98";
  installFetch({ onSave: (body) => saved.push(body) });
  const view = renderBar({ patientId: "patient-1", appointmentId: "appt-1", transcriptText: "" });
  try {
    await flush();
    view.rerender({ transcriptText: sample });
    await flush();

    const chip = document.querySelector("[data-testid='vitals-summary']");
    assert.match(chip.textContent, /BP 120\/80/);
    assert.match(chip.textContent, /Pulse 78/);
    assert.match(chip.textContent, /Temp 98\.6°F/);
    assert.match(chip.textContent, /SpO2 98%/);
    assert.equal(document.querySelector("[data-testid='vitals-modal']"), null);

    await act(async () => {
      chip.click();
    });
    await flush();
    assert.equal(document.querySelector("[aria-label='BP systolic']").value, "120");
    assert.equal(document.querySelector("[aria-label='BP diastolic']").value, "80");
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "78");
    assert.equal(document.querySelector("[aria-label='Temperature']").value, "98.6");
    assert.equal(document.querySelector("[aria-label='SpO2']").value, "98");

    await act(async () => {
      setInput(document.querySelector("[aria-label='Pulse']"), "90");
    });
    view.rerender({ transcriptText: `${sample}, pulse 78 again` });
    await flush();
    assert.equal(document.querySelector("[aria-label='Pulse']").value, "90");

    await act(async () => {
      document.querySelector("[data-testid='vitals-save']").click();
    });
    await flush();
    assert.match(document.querySelector("[data-testid='vitals-summary']").textContent, /Pulse 90/);
    const last = saved.at(-1);
    assert.equal(last.bp_systolic, 120);
    assert.equal(String(last.pulse), "90");
    assert.equal(last.temp, 98.6);
    assert.equal(last.spo2, 98);

    await view.unmount();
    installFetch({
      vitals: {
        ...last,
        heard_text: null,
      },
    });
    const reloaded = renderBar({
      patientId: "patient-1",
      appointmentId: "appt-1",
      transcriptText: sample,
    });
    try {
      await flush();
      assert.match(document.querySelector("[data-testid='vitals-summary']").textContent, /BP 120\/80/);
      assert.match(document.querySelector("[data-testid='vitals-summary']").textContent, /Pulse 90/);
      assert.match(document.querySelector("[data-testid='vitals-summary']").textContent, /SpO2 98%/);
    } finally {
      await reloaded.unmount();
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (view.host.isConnected) await view.unmount();
  }
});
