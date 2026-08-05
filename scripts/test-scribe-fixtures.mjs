#!/usr/bin/env node
/**
 * @fileoverview Run fixture transcripts through the internal SOAP text→Gemini
 * path (same as scripts/soap-prompt-compare.mjs) and compare against expect.
 *
 * Does NOT go through SOAPGenerationService.generate() (that requires a DB
 * session + reviewed transcript_version). Audio / Deepgram are not involved.
 *
 * Usage:
 *   node scripts/test-scribe-fixtures.mjs
 *
 * Requires GEMINI_API_KEY (or the active SOAP_AI_PROVIDER key) in .env.local.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: new URL("../.env.local", import.meta.url).pathname });

import { fixtures } from "../fixtures/scribe-test-transcripts.js";
import {
  buildSOAPPrompt,
  SOAP_JSON_SCHEMA,
} from "../features/scribe/services/soap-prompt.js";
import {
  createSOAPAIProvider,
  resolveSOAPProviderName,
} from "../features/scribe/services/ai-providers/provider-factory.js";
import { SOAP_GENERATION_CONFIG } from "../features/scribe/constants.js";
import { parseVitalsFromObjective } from "../features/scribe/consultation-workspace/lib/vitals-objective.js";

function buildContext(fixture) {
  return {
    patient: {
      age: fixture.patient?.age ?? null,
      gender: fixture.patient?.gender ?? null,
    },
    doctor: {
      specialization: "General Physician",
      clinicName: "Nadi Clinic",
    },
    consultation: {
      appointmentType: "New consultation",
      language: "en",
      sessionId: `fixture-${fixture.id}`,
    },
    transcriptText: fixture.transcript,
  };
}

/**
 * Lightweight expect checks — logs pass/fail without failing the process
 * (fixture harness for inspection).
 */
function evaluate(fixture, note) {
  const results = [];
  const expect = fixture.expect ?? {};

  if (typeof expect.objective === "string") {
    const actual = String(note.objective ?? "").trim();
    const ok = actual === expect.objective || actual.toLowerCase() === expect.objective.toLowerCase();
    results.push({
      check: "objective === expect.objective",
      ok,
      expected: expect.objective,
      actual,
    });
  }

  if (expect.vitals && typeof expect.vitals === "object") {
    const actualVitals = parseVitalsFromObjective(note.objective ?? "");
    const ok = Object.entries(expect.vitals).every(
      ([key, value]) => String(actualVitals[key] ?? "") === String(value ?? ""),
    );
    results.push({
      check: "structured vitals empty / match expect.vitals",
      ok,
      expected: expect.vitals,
      actual: actualVitals,
    });
  }

  if (Array.isArray(expect.planContains)) {
    const plan = String(note.plan ?? "");
    for (const needle of expect.planContains) {
      results.push({
        check: `plan contains "${needle}"`,
        ok: plan.includes(needle),
        expected: needle,
        actual: plan,
      });
    }
  }

  if (Array.isArray(expect.planDoesNotContainCollapsed)) {
    const plan = String(note.plan ?? "");
    for (const needle of expect.planDoesNotContainCollapsed) {
      // Only flag collapse when the range form is also expected somewhere —
      // e.g. "3-4 days" present is good; bare "for 3 days" as the only duration is bad.
      const hasRange = Array.isArray(expect.planContains)
        ? expect.planContains.some((r) => plan.includes(r))
        : false;
      const collapsedAlone = plan.includes(needle) && !hasRange;
      results.push({
        check: `plan does not collapse to "${needle}" without range`,
        ok: !collapsedAlone,
        expected: `range preserved (not only "${needle}")`,
        actual: plan,
      });
    }
  }

  return results;
}

async function runFixture(provider, fixture) {
  console.log("=".repeat(88));
  console.log(`FIXTURE: ${fixture.id}`);
  console.log(fixture.description);
  console.log("=".repeat(88));

  const context = buildContext(fixture);
  const prompt = buildSOAPPrompt(context);
  const generated = await provider.generateStructuredJSON({
    input: prompt,
    jsonSchema: SOAP_JSON_SCHEMA,
    temperature: SOAP_GENERATION_CONFIG.TEMPERATURE,
    maxOutputTokens: SOAP_GENERATION_CONFIG.MAX_OUTPUT_TOKENS,
  });

  const note = JSON.parse(generated.text);
  const vitals = parseVitalsFromObjective(note.objective ?? "");
  const checks = evaluate(fixture, note);

  console.log("\n--- expect ---");
  console.log(JSON.stringify(fixture.expect, null, 2));

  console.log("\n--- SOAP output ---");
  console.log(JSON.stringify(note, null, 2));

  console.log("\n--- structured vitals (from Objective) ---");
  console.log(JSON.stringify(vitals, null, 2));

  console.log("\n--- checks ---");
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.check}`);
    if (!c.ok) {
      console.log(`       expected: ${JSON.stringify(c.expected)}`);
      console.log(`       actual:   ${JSON.stringify(c.actual)}`);
    }
  }
  console.log("");

  return { fixture: fixture.id, note, vitals, checks };
}

async function main() {
  const providerName = resolveSOAPProviderName();
  console.log(`Active SOAP AI provider: ${providerName}`);
  console.log(
    "Path: buildSOAPPrompt(transcriptText) → AIProvider.generateStructuredJSON (no audio/DB)\n",
  );

  let provider;
  try {
    provider = createSOAPAIProvider();
  } catch (err) {
    console.error(`Could not create provider: ${err.message}`);
    process.exit(1);
  }

  const list = Object.values(fixtures);
  const summaries = [];

  for (const fixture of list) {
    try {
      summaries.push(await runFixture(provider, fixture));
    } catch (err) {
      console.error(`FAILED ${fixture.id}: ${err instanceof Error ? err.message : err}`);
      summaries.push({
        fixture: fixture.id,
        error: err instanceof Error ? err.message : String(err),
        checks: [],
      });
    }
  }

  console.log("=".repeat(88));
  console.log("SUMMARY");
  for (const s of summaries) {
    if (s.error) {
      console.log(`  ${s.fixture}: ERROR — ${s.error}`);
      continue;
    }
    const passed = s.checks.filter((c) => c.ok).length;
    const total = s.checks.length;
    console.log(`  ${s.fixture}: ${passed}/${total} checks passed`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
