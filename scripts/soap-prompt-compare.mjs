#!/usr/bin/env node
/**
 * @fileoverview Before/after comparison harness for the SOAP generation prompt.
 *
 * Runs the OLD prompt (soap_indian_gp_v1, snapshotted below) and the NEW
 * prompt (features/scribe/services/soap-prompt.js, soap_indian_gp_v2)
 * against the same set of sample transcripts and the configured AI
 * provider (SOAP_AI_PROVIDER in .env.local — defaults to gemini here),
 * printing both outputs side by side for review.
 *
 * Usage:
 *   node scripts/soap-prompt-compare.mjs
 *
 * Requires a valid API key for the active provider (GEMINI_API_KEY /
 * ANTHROPIC_API_KEY / OPENAI_API_KEY depending on SOAP_AI_PROVIDER).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: new URL("../.env.local", import.meta.url).pathname });

import { buildSOAPPrompt as buildSOAPPromptNew, SOAP_JSON_SCHEMA } from "../features/scribe/services/soap-prompt.js";
import { createSOAPAIProvider, resolveSOAPProviderName } from "../features/scribe/services/ai-providers/provider-factory.js";

// ── Snapshot of the OLD prompt (soap_indian_gp_v1) for side-by-side comparison ──
function buildSOAPPromptOld(context) {
  return [
    {
      role: "system",
      content: [
        "You are Nadi AI, a clinical documentation assistant for Indian outpatient general practice clinics.",
        "Generate only a structured SOAP note as JSON matching the provided schema.",
        "Use ONLY information explicitly present in the reviewed transcript and provided context.",
        "Do not fabricate diagnoses, medications, vitals, test results, allergies, examination findings, or follow-up plans.",
        "If information is not available, use these exact fallbacks:",
        "- Subjective: 'Not documented in transcript.'",
        "- Objective: 'Not documented in transcript.'",
        "- Assessment: 'Assessment not documented in transcript.'",
        "- Plan: 'Plan not documented in transcript.'",
        "Never invent symptoms, diagnoses, examination findings, medications, dosages, or treatment plans.",
        "Do not include prescriptions unless a medication was explicitly discussed in the transcript.",
        "Keep language professional, concise, and suitable for a doctor to review.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Prompt version: soap_indian_gp_v1",
        "",
        "PATIENT CONTEXT:",
        JSON.stringify(context.patient ?? {}, null, 2),
        "",
        "DOCTOR CONTEXT:",
        JSON.stringify(context.doctor ?? {}, null, 2),
        "",
        "CONSULTATION CONTEXT:",
        JSON.stringify(context.consultation ?? {}, null, 2),
        "",
        "REVIEWED TRANSCRIPT:",
        context.transcriptText || "Not documented in transcript.",
        "",
        "TASK:",
        "Create a SOAP note for this consultation.",
        "For Subjective, document only patient-reported information from the transcript; otherwise 'Not documented in transcript.'",
        "For Objective, include only observed/reported objective findings explicitly present; otherwise 'Not documented in transcript.'",
        "For Assessment, describe clinical impression only if supported by transcript; otherwise 'Assessment not documented in transcript.'",
        "For Plan, include only explicit advice/tests/follow-up discussed; otherwise 'Plan not documented in transcript.'",
        "Hallucinated or inferred clinical content is strictly prohibited.",
      ].join("\n"),
    },
  ];
}

// ── Sample transcripts ──────────────────────────────────────────────────
const TRANSCRIPTS = [
  {
    name: "Acid reflux (demo case)",
    context: {
      patient: { age: 38, gender: "female" },
      doctor: { specialization: "General Physician", clinicName: "Nadi Clinic" },
      consultation: { appointmentType: "Follow-up", language: "en" },
      transcriptText: [
        "Doctor: What's bothering you today?",
        "Patient: Doctor, I'm suffering from acid reflux since 3 days. There's chest pain, chest burning, and I keep getting a vomiting sensation.",
        "Doctor: Any fever, or is it just the burning and nausea?",
        "Patient: No fever. But I also have a headache since morning, on and off.",
        "Doctor: Does the burning get worse after eating, or lying down?",
        "Patient: Yes, it's worse after meals and at night when I lie down.",
        "Doctor: Okay. Blood pressure is 122 over 80, pulse 82. Abdomen is soft, no tenderness on palpation.",
        "Doctor: This looks like GERD — acid reflux. I'll start you on an antacid, pantoprazole 40mg once daily before breakfast for 2 weeks.",
        "Doctor: Avoid spicy and oily food, no lying down right after meals, and come back if the pain worsens or you have trouble swallowing.",
      ].join("\n"),
    },
  },
  {
    name: "Viral fever",
    context: {
      patient: { age: 29, gender: "male" },
      doctor: { specialization: "General Physician", clinicName: "Nadi Clinic" },
      consultation: { appointmentType: "New consultation", language: "en" },
      transcriptText: [
        "Doctor: Tell me what's going on.",
        "Patient: I've had fever with shivering since yesterday night, and my whole body is paining.",
        "Doctor: Any cough, cold, sore throat?",
        "Patient: A little cough, and my throat feels scratchy.",
        "Doctor: Any loose motions or vomiting?",
        "Patient: No, just the fever and body pain.",
        "Doctor: Let's check — temperature is 101.4 Fahrenheit, pulse 96, BP 118 over 76. Throat looks mildly red.",
        "Doctor: Sounds like a viral fever. Take paracetamol 650mg three times a day for 3 days, plenty of fluids and rest.",
        "Doctor: If fever crosses 103 or lasts more than 4 days, or you get breathlessness, come back immediately.",
      ].join("\n"),
    },
  },
  {
    name: "Low back pain",
    context: {
      patient: { age: 45, gender: "male" },
      doctor: { specialization: "General Physician", clinicName: "Nadi Clinic" },
      consultation: { appointmentType: "New consultation", language: "en" },
      transcriptText: [
        "Doctor: What brings you in?",
        "Patient: My lower back has been paining badly for the last week, especially when I bend or lift something.",
        "Doctor: Does the pain go down your leg, or stay in the back?",
        "Patient: It stays in the back mostly, sometimes a little into my right hip.",
        "Doctor: Any numbness or tingling in the legs? Any weakness?",
        "Patient: No numbness, no weakness.",
        "Doctor: On examination, tenderness over the lower lumbar region, straight leg raise test is negative both sides.",
        "Doctor: This looks like a mechanical low back strain. I'll give you a muscle relaxant, and an anti-inflammatory — aceclofenac plus paracetamol combination, twice a day for 5 days.",
        "Doctor: Avoid heavy lifting, apply a hot water bag, gentle stretching. If you develop numbness, weakness or bladder issues, come back immediately.",
      ].join("\n"),
    },
  },
];

async function main() {
  const providerName = resolveSOAPProviderName();
  console.log(`Active SOAP AI provider: ${providerName}\n`);

  let provider;
  try {
    provider = createSOAPAIProvider();
  } catch (err) {
    console.error(`Could not create provider: ${err.message}`);
    process.exit(1);
  }

  for (const { name, context } of TRANSCRIPTS) {
    console.log("=".repeat(100));
    console.log(`TRANSCRIPT: ${name}`);
    console.log("=".repeat(100));

    for (const [label, builder] of [["BEFORE (soap_indian_gp_v1)", buildSOAPPromptOld], ["AFTER (soap_indian_gp_v2)", buildSOAPPromptNew]]) {
      console.log(`\n--- ${label} ---`);
      try {
        const result = await provider.generateStructuredJSON({
          input: builder(context),
          jsonSchema: SOAP_JSON_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 1800,
        });
        const note = JSON.parse(result.text);
        console.log(JSON.stringify(note, null, 2));
      } catch (err) {
        console.error(`FAILED: ${err.message}`);
      }
    }
    console.log("");
  }
}

main();
