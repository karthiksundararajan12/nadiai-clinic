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
const { NewPatientModal } = await import("./NewPatientModal.jsx");

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

    const consent = document.querySelector("[data-testid='patient-whatsapp-consent']");
    assert.equal(consent?.checked, false);
    assert.match(
      document.body.textContent,
      /No WhatsApp reminders or prescriptions will be sent without consent\./,
    );

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
      consentGiven: false,
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

test("compact row keeps the empty-state sentence and a labeled New patient button", async () => {
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

  const view = renderSelector({ compact: true, onSelect() {} });
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const empty = view.host.querySelector("[data-testid='scribe-patient-empty']");
    assert.equal(empty?.textContent, "No appointments today. Search a patient or add a new one.");
    const select = view.host.querySelector("[data-testid='scribe-patient-select']");
    assert.ok(select);
    assert.equal(select.className.includes("truncate"), false);
    assert.equal(select.options[0].text, "Search a patient");
    const button = view.host.querySelector("[data-testid='scribe-create-patient']");
    assert.ok(button);
    assert.equal(button.textContent.includes("New patient"), true);
    assert.equal(button.querySelector(".sr-only"), null);

    await act(async () => {
      button.click();
    });
    assert.ok(document.querySelector("[data-testid='new-patient-modal']"));
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

function renderModal(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const current = { ...props };
  function draw() {
    act(() => {
      root.render(createElement(NewPatientModal, current));
    });
  }
  draw();
  return {
    host,
    rerender(next) {
      Object.assign(current, next);
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

test("consent stays unchecked until the user checks it, then the save payload records it", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          patient: {
            id: "patient-new",
            name: "Asha Rao",
            age: null,
            gender: "Male",
            phone: "+91 9876543210",
            lastVisit: null,
          },
        };
      },
    };
  };

  const view = renderModal({ open: true, onOpenChange() {}, onCreated() {} });
  try {
    const consent = document.querySelector("[data-testid='patient-whatsapp-consent']");
    assert.equal(consent.checked, false);
    assert.equal(consent.getAttribute("autocomplete"), "off");
    assert.match(
      document.body.textContent,
      /Patient has consented to WhatsApp communication/,
    );
    assert.match(
      document.body.textContent,
      /No WhatsApp reminders or prescriptions will be sent without consent\./,
    );

    await act(async () => {
      consent.click();
    });
    assert.equal(document.querySelector("[data-testid='patient-whatsapp-consent']").checked, true);
    assert.equal(document.querySelector("[data-testid='patient-whatsapp-consent-note']"), null);

    await act(async () => {
      setInput(document.getElementById("new-patient-name"), "Asha Rao");
      setInput(document.getElementById("new-patient-phone"), "9876543210");
    });
    const save = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Save patient"),
    );
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((call) => String(call.url) === "/api/patients");
    assert.equal(JSON.parse(post.opts.body).consentGiven, true);
    assert.equal(JSON.parse(post.opts.body).allowFamilyMember, undefined);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a duplicate phone offers the existing patient and an explicit family-member save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const selected = [];
  let duplicate = true;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body });
    if (String(url).includes("/api/scribe/eligible-patients")) {
      return {
        ok: true,
        async json() {
          return { patients: [] };
        },
      };
    }
    if (duplicate) {
      return {
        ok: false,
        status: 409,
        async json() {
          return {
            error: "A patient with this number already exists",
            existingPatient: { id: "patient-existing", full_name: "Ravi Kumar" },
          };
        },
      };
    }
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          patient: {
            id: "patient-child",
            name: "Little Kiran",
            age: null,
            gender: "Male",
            phone: "+91 9876543210",
            lastVisit: null,
          },
        };
      },
    };
  };

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

    await act(async () => {
      setInput(document.getElementById("new-patient-name"), "Little Kiran");
      setInput(document.getElementById("new-patient-phone"), "9876543210");
    });
    const save = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Save patient"),
    );
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.match(
      document.body.textContent,
      /A patient with this number already exists: Ravi Kumar/,
    );
    assert.equal(document.querySelector("[data-testid='patient-whatsapp-consent']").checked, false);
    assert.equal(selected.length, 0);
    assert.equal(document.body.textContent.includes("Patient saved"), false);
    assert.ok(document.querySelector("[data-testid='add-family-member']"));

    await act(async () => {
      setInput(document.getElementById("new-patient-name"), "Ravi Kumar");
    });
    assert.equal(document.querySelector("[data-testid='add-family-member']"), null);

    await act(async () => {
      setInput(document.getElementById("new-patient-name"), "Little Kiran");
    });
    duplicate = false;
    const addAnyway = document.querySelector("[data-testid='add-family-member']");
    await act(async () => {
      addAnyway.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const posts = calls.filter((call) => call.url === "/api/patients");
    assert.equal(posts.length, 2);
    assert.equal(JSON.parse(posts[0].body).allowFamilyMember, undefined);
    assert.equal(JSON.parse(posts[1].body).allowFamilyMember, true);
    assert.equal(JSON.parse(posts[1].body).name, "Little Kiran");
    assert.equal(JSON.parse(posts[1].body).consentGiven, false);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, "patient-child");
    assert.equal(selected[0].appointment_id, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("Use this patient selects the existing record in Scribe without creating another", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const selected = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body });
    if (String(url).includes("/api/scribe/eligible-patients")) {
      return {
        ok: true,
        async json() {
          return { patients: [] };
        },
      };
    }
    return {
      ok: false,
      status: 409,
      async json() {
        return {
          error: "A patient with this number already exists",
          existingPatient: { id: "patient-existing", full_name: "Ravi Kumar" },
        };
      },
    };
  };

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
    await act(async () => {
      setInput(document.getElementById("new-patient-name"), "Little Kiran");
      setInput(document.getElementById("new-patient-phone"), "+91 9876543210");
    });
    const save = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Save patient"),
    );
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const useExisting = document.querySelector("[data-testid='use-existing-patient']");
    await act(async () => {
      useExisting.click();
    });

    assert.equal(calls.filter((call) => call.url === "/api/patients").length, 1);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, "patient-existing");
    assert.equal(selected[0].name, "Ravi Kumar");
    assert.equal(selected[0].appointment_id, null);
    assert.equal(document.querySelector("[data-testid='new-patient-modal']"), null);
    assert.equal(document.body.textContent.includes("Patient saved"), false);
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
