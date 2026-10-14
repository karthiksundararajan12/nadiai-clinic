import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchHeaderSearchResults,
  parseHeaderSearchDate,
} from "./header-search.js";

test("parseHeaderSearchDate accepts ISO, day-first, and month-name dates", () => {
  assert.equal(parseHeaderSearchDate("2026-10-14"), "2026-10-14");
  assert.equal(parseHeaderSearchDate("14/10/2026"), "2026-10-14");
  assert.equal(parseHeaderSearchDate("14 Oct 2026"), "2026-10-14");
  assert.equal(parseHeaderSearchDate("Oct 14", 2026), "2026-10-14");
  assert.equal(parseHeaderSearchDate("Asha"), null);
  assert.equal(parseHeaderSearchDate("31 Feb 2026"), null);
});

test("fetchHeaderSearchResults does not query fewer than 2 characters", async () => {
  let called = false;
  const result = await fetchHeaderSearchResults(" ", {
    fetchImpl: async () => {
      called = true;
      throw new Error("should not fetch");
    },
  });
  assert.equal(called, false);
  assert.deepEqual(result, { patients: [], appointments: [], failed: false });
});

test("fetchHeaderSearchResults queries patients and appointments and merges a date match", async () => {
  const urls = [];
  const result = await fetchHeaderSearchResults("14 Oct 2026", {
    now: new Date("2026-10-14T00:00:00.000Z"),
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (String(url).startsWith("/api/patients")) {
        return jsonResponse({
          patients: [{ id: "p1", name: "Asha Rao", phone: "+91 9840227132" }],
        });
      }
      if (String(url).includes("range=custom")) {
        return jsonResponse({
          appointments: [{ id: "a-date", patientName: "Asha Rao", slotLabel: "14 Oct, 10:00 AM" }],
        });
      }
      return jsonResponse({
        appointments: [{ id: "a-name", patientName: "Asha Rao", slotLabel: "14 Oct, 10:00 AM" }],
      });
    },
  });

  assert.equal(urls.some((url) => url.startsWith("/api/patients?search=")), true);
  assert.equal(urls.some((url) => url.includes("/api/appointments?search=")), true);
  assert.equal(urls.some((url) => url.includes("from=2026-10-14") && url.includes("to=2026-10-14")), true);
  assert.equal(result.patients[0].name, "Asha Rao");
  assert.deepEqual(result.appointments.map((row) => row.id), ["a-name", "a-date"]);
  assert.equal(result.failed, false);
});

test("fetchHeaderSearchResults logs query failures", async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => {
    logged.push(args);
  };
  try {
    const result = await fetchHeaderSearchResults("Asha", {
      fetchImpl: async (url) => {
        if (String(url).startsWith("/api/patients")) {
          return { ok: false, status: 500, async json() { return { error: "db down" }; } };
        }
        return jsonResponse({ appointments: [] });
      },
    });
    assert.equal(result.failed, true);
    assert.equal(result.patients.length, 0);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "Header search failed");
    assert.equal(logged[0][1].label, "Patient search");
    assert.match(logged[0][1].error.message, /db down/);
  } finally {
    console.error = original;
  }
});

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  };
}
