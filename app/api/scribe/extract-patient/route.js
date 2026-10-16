import { NextResponse } from "next/server";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { createSOAPAIProvider } from "@/features/scribe/services/ai-providers/provider-factory.js";
import { createLogger } from "@/features/scribe/logger.js";
import {
  EMPTY_EXTRACTED_PATIENT,
  PATIENT_EXTRACTION_PROMPT,
  PATIENT_EXTRACTION_SCHEMA,
  extractPatientFromTranscript,
  normalizeExtractedPatient,
} from "@/features/scribe/consultation-workspace/lib/patient-extraction.js";

const log = createLogger({ component: "API /api/scribe/extract-patient" });

export async function POST(request) {
  const ctx = await resolveRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a transcript" }, { status: 400 });
  }

  const transcript = String(body?.transcript ?? "").slice(0, 12000);
  if (!transcript.trim()) {
    return NextResponse.json({ patient: EMPTY_EXTRACTED_PATIENT });
  }

  try {
    const provider = createSOAPAIProvider();
    const generated = await provider.generateStructuredJSON({
      input: [
        { role: "system", content: PATIENT_EXTRACTION_PROMPT },
        { role: "user", content: transcript },
      ],
      jsonSchema: PATIENT_EXTRACTION_SCHEMA,
      temperature: 0,
      maxOutputTokens: 400,
      thinkingBudget: 0,
    });
    const parsed = JSON.parse(generated.text);
    return NextResponse.json({
      patient: normalizeExtractedPatient(parsed, transcript),
    });
  } catch (error) {
    log.error("Patient extraction failed", {
      clinicId: ctx.clinicId,
      error: error instanceof Error ? error.message : "extraction failed",
    });
    return NextResponse.json({
      patient: extractPatientFromTranscript(transcript),
    });
  }
}
