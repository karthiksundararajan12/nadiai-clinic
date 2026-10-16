import { NextResponse } from "next/server";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { createLogger } from "@/features/scribe/logger.js";
import { SCRIBE_LANGUAGE } from "@/features/scribe/constants.js";
import { DeepgramProvider } from "@/features/scribe/services/transcription-providers/deepgram.provider.js";
import { extractVitals } from "@/features/scribe/consultation-workspace/lib/vitals-utterance.js";
import { createSOAPAIProvider } from "@/features/scribe/services/ai-providers/provider-factory.js";

const log = createLogger({ component: "API /api/scribe/vitals/hear" });

const ALLOWED_LANGUAGES = new Set(Object.values(SCRIBE_LANGUAGE));

const VITALS_JSON_SCHEMA = {
  name: "visit_vitals_extract",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["bp_systolic", "bp_diastolic", "pulse", "temp", "temp_unit", "spo2", "weight", "height", "sugar", "sugar_unit", "sugar_type", "rr"],
    properties: {
      bp_systolic: { type: ["number", "null"] },
      bp_diastolic: { type: ["number", "null"] },
      pulse: { type: ["number", "null"] },
      temp: { type: ["number", "null"] },
      temp_unit: { type: ["string", "null"], enum: ["F", "C", null] },
      spo2: { type: ["number", "null"] },
      weight: { type: ["number", "null"] },
      height: { type: ["number", "null"] },
      sugar: { type: ["number", "null"] },
      sugar_unit: { type: ["string", "null"], enum: ["mg/dL", "mmol/L", null] },
      sugar_type: { type: ["string", "null"], enum: ["random", "fasting", "pp", null] },
      rr: { type: ["number", "null"] },
    },
  },
};

async function completeWithModel(text) {
  const provider = createSOAPAIProvider();
  const generated = await provider.generateStructuredJSON({
    input: [
      {
        role: "system",
        content: [
          "Extract vitals that were explicitly spoken. Return JSON only.",
          "Use null for anything not said. Never guess or convert a missing unit into a number.",
          "Sugar, RBS, FBS, and PP are the sugar field, not blood pressure. sugar_type is random, fasting, or pp only when that type was spoken. sugar_unit is mg/dL or mmol/L only when that unit was spoken.",
          "Respiratory rate, RR, and breaths per minute are the rr field.",
          "Leave every field null when the audio is unclear.",
          "temp_unit is F or C only when the speaker said Fahrenheit/F or Celsius/C. Otherwise null.",
        ].join(" "),
      },
      { role: "user", content: text },
    ],
    jsonSchema: VITALS_JSON_SCHEMA,
    temperature: 0,
    maxOutputTokens: 400,
    thinkingBudget: 0,
  });
  return JSON.parse(generated.text);
}

export async function POST(request) {
  const ctx = await resolveRequestContext(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected an audio clip" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!audio || typeof audio.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Audio clip is required" }, { status: 400 });
  }

  const requested = String(form.get("language") || SCRIBE_LANGUAGE.ENGLISH);
  const language = ALLOWED_LANGUAGES.has(requested) ? requested : SCRIBE_LANGUAGE.ENGLISH;

  try {
    const provider = new DeepgramProvider();
    const englishClip = language === SCRIBE_LANGUAGE.ENGLISH;
    const result = await provider.transcribe({
      audioBlobs: [audio],
      mimeType: audio.type || "audio/webm",
      language,
      sessionId: "vitals-clip",
      timeoutMs: 20000,
      // nova-2-medical only accepts en / en-US, so English vitals clips use nova-2
      // with en-IN and numerals. Consultation diarization is unchanged.
      listen: englishClip
        ? { languageCode: "en-IN", numerals: true, model: "nova-2" }
        : undefined,
    });
    const transcript = String(result?.text ?? "").trim();
    log.info("Vitals clip transcribed", {
      clinicId: ctx.clinicId,
      language,
      transcript,
    });
    const vitals = await extractVitals(transcript, {
      complete: (text) => completeWithModel(text),
    });
    return NextResponse.json({ transcript, vitals, language });
  } catch (error) {
    log.error("Vitals clip failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : "Could not transcribe vitals";
    const status = /DEEPGRAM_API_KEY|not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
