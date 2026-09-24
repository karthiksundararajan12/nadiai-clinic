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

const { createRoot } = await import("react-dom/client");
const { act, createElement } = await import("react");
const { PatientSelector } = await import("./PatientSelector.jsx");

function renderSelector(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(PatientSelector, props));
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("Create new patient opens a modal and the inline form is gone", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/scribe/eligible-patients")) {
      return {
        ok: true,
        async json() {
          return { patients: [] };
        },
      };
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const view = renderSelector({ onSelect() {} });
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(document.body.textContent.includes("Create and Attach"), false);
    assert.equal(document.querySelector("[data-testid='new-patient-modal']"), null);

    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Create new patient"),
    );
    assert.ok(trigger);

    await act(async () => {
      trigger.click();
    });

    const dialog = document.querySelector("[data-testid='new-patient-modal']");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(document.body.textContent.includes("Create and Attach"), false);
    assert.equal(document.body.textContent.includes("New patient"), true);
    assert.equal(document.body.textContent.includes("Save patient"), true);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("saving a patient posts the same payload and selects the new patient", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("/api/scribe/eligible-patients")) {
      return {
        ok: true,
        async json() {
          return { patients: [] };
        },
      };
    }
    if (String(url) === "/api/patients" && opts.method === "POST") {
      return {
        ok: true,
        status: 201,
        async json() {
          return {
            patient: {
              id: "patient-new",
              name: "Asha Rao",
              age: 34,
              gender: "Female",
              phone: "+91 9876543210",
              lastVisit: null,
            },
          };
        },
      };
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const selected = [];
  const view = renderSelector({
    onSelect(patient) {
      selected.push(patient);
    },
  });

  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Create new patient"),
    );
    await act(async () => {
      trigger.click();
    });

    const name = document.getElementById("new-patient-name");
    const phone = document.getElementById("new-patient-phone");
    const age = document.getElementById("new-patient-age");
    const gender = document.getElementById("new-patient-gender");
    assert.ok(name && phone && age && gender);

    await act(async () => {
      setInput(name, "Asha Rao");
      setInput(phone, "+91 9876543210");
      setInput(age, "34");
      setInput(gender, "Female");
    });

    const save = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Save patient"),
    );
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((call) => call.url === "/api/patients");
    assert.ok(post);
    assert.equal(post.opts.method, "POST");
    assert.deepEqual(JSON.parse(post.opts.body), {
      name: "Asha Rao",
      phone: "+91 9876543210",
      age: "34",
      gender: "Female",
    });
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, "patient-new");
    assert.equal(selected[0].name, "Asha Rao");
    assert.equal(selected[0].appointment_id, null);
    assert.equal(document.querySelector("[data-testid='new-patient-modal']"), null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

function setInput(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor.set.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}
