/**
 * Pull a patient identity out of a consultation transcript.
 * Numbers are only kept when they were spoken. Sex is never guessed from a name.
 */

export const FIRST_EXTRACT_MS = 45_000;
export const EXTRACT_INTERVAL_MS = 30_000;

export const PATIENT_EXTRACTION_PROMPT = [
  "Extract only what the speaker clearly states about the PATIENT (not the doctor, not a relative unless the patient is a child or the relative is explicitly the patient).",
  "Return null for anything not clearly stated. Never guess or invent.",
  "Fix speech-to-text quirks: split digits ('4 5' = 45, '1 80' = 180), Indian name spellings, 'aged/age/years old/vayasu/umar' for age.",
  "The conversation may be English, Hindi, Hinglish, Tamil or Telugu.",
  "Phone numbers are 10 digits, return digits only.",
  "If the patient is a child, return age in months when under 2 years.",
  "Sex: infer ONLY from explicit words (he/she, male/female, Mr/Mrs/Master/Baby of, boy/girl).",
  "Mark sex confidence low when it comes from he/she. Never infer sex from the name alone.",
].join(" ");

export const PATIENT_EXTRACTION_SCHEMA = {
  name: "patient_from_consultation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "age", "age_unit", "sex", "phone", "confidence"],
    properties: {
      name: { type: ["string", "null"] },
      age: { type: ["number", "null"] },
      age_unit: { type: ["string", "null"], enum: ["years", "months", null] },
      sex: { type: ["string", "null"], enum: ["male", "female", "other", null] },
      phone: { type: ["string", "null"] },
      confidence: {
        type: "object",
        additionalProperties: false,
        required: ["name", "age", "sex", "phone"],
        properties: {
          name: { type: ["string", "null"], enum: ["high", "low", null] },
          age: { type: ["string", "null"], enum: ["high", "low", null] },
          sex: { type: ["string", "null"], enum: ["high", "low", null] },
          phone: { type: ["string", "null"], enum: ["high", "low", null] },
        },
      },
    },
  },
};

const EMPTY_CONFIDENCE = Object.freeze({
  name: null,
  age: null,
  sex: null,
  phone: null,
});

export const EMPTY_EXTRACTED_PATIENT = Object.freeze({
  name: null,
  age: null,
  age_unit: null,
  sex: null,
  phone: null,
  confidence: EMPTY_CONFIDENCE,
});

const NAME_STOP = new Set(["doctor", "patient", "age", "name", "the", "and"]);
const WORD_NUMBER = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const WORD_RE = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)";

/**
 * A consultation with no patient yet. Pipeline status stays CREATED so the
 * recording state machine is unchanged; assignment_status is the draft flag.
 *
 * @param {{ id?: string, patient_id?: string|null, status?: string }} [session]
 */
export function asDraftConsultation(session = {}) {
  return {
    id: session.id ?? null,
    patient_id: null,
    status: "draft",
    assignment_status: "draft",
    pipeline_status: session.status ?? "CREATED",
  };
}

/**
 * @param {{ patient_id?: string|null, status?: string }} session
 */
export function assignmentStatus(session = {}) {
  return consultationAssignment(session);
}

/**
 * @param {Array<{ patient_id?: string|null }>} sessions
 */
export function orderUnassignedFirst(sessions = []) {
  return [...sessions].sort((left, right) => Number(Boolean(left?.patient_id)) - Number(Boolean(right?.patient_id)));
}

/**
 * @param {string} text
 */
export function collapseSpokenDigits(text) {
  return String(text ?? "")
    .replace(/\b(\d)\s+(\d{2})\b/g, "$1$2")
    .replace(/(?:\b\d\b\s+)+\b\d\b/g, (match) => match.replace(/\s+/g, ""));
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeExtractedPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  if (!/^\d{10}$/.test(local)) return null;
  return local;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeExtractedName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}. ]{2,60}$/u.test(name)) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (NAME_STOP.has(name.toLowerCase())) return null;
  return name;
}

function confidenceOf(value) {
  return value === "low" || value === "high" ? value : null;
}

function explicitSex(text) {
  const source = String(text ?? "");
  if (/\b(?:boy|male|master)\b/i.test(source)) return { value: "male", confidence: "high" };
  if (/\b(?:girl|female|mrs|ms|woman)\b/i.test(source)) return { value: "female", confidence: "high" };
  if (/\bmr\b/i.test(source) && !/\bmrs\b/i.test(source)) return { value: "male", confidence: "high" };
  if (/\b(?:she|her)\b/i.test(source)) return { value: "female", confidence: "low" };
  if (/\b(?:he|him)\b/i.test(source)) return { value: "male", confidence: "low" };
  return null;
}

function wordNumber(phrase) {
  const parts = String(phrase ?? "").toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!parts.length || parts.some((part) => WORD_NUMBER[part] == null)) return null;
  if (parts.length === 1) return WORD_NUMBER[parts[0]];
  if (parts.length === 2 && WORD_NUMBER[parts[0]] >= 20 && WORD_NUMBER[parts[1]] < 10) {
    return WORD_NUMBER[parts[0]] + WORD_NUMBER[parts[1]];
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {string} [transcript]
 */
export function normalizeExtractedPatient(raw, transcript = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const spokenSex = explicitSex(transcript);
  const name = normalizeExtractedName(source.name);
  let age = source.age == null || source.age === "" ? null : Number(source.age);
  if (!Number.isInteger(age)) age = null;
  let ageUnit = source.age_unit === "months" || source.age_unit === "years" ? source.age_unit : null;
  if (age == null) ageUnit = null;
  if (ageUnit === "months" && age != null && age >= 24) {
    age = Math.round(age / 12);
    ageUnit = "years";
  }
  if (age != null && (age < 0 || age > 120)) {
    age = null;
    ageUnit = null;
  }
  if (age != null && !ageUnit) ageUnit = "years";

  let sex = source.sex === "male" || source.sex === "female" || source.sex === "other" ? source.sex : null;
  let sexConfidence = confidenceOf(source.confidence?.sex);
  if (spokenSex) {
    sex = spokenSex.value;
    sexConfidence = spokenSex.confidence;
  } else if (String(transcript ?? "").trim()) {
    sex = null;
    sexConfidence = null;
  } else if (sex && sexConfidence !== "low") {
    sexConfidence = "low";
  }

  const phone = normalizeExtractedPhone(source.phone);
  const confidence = {
    name: name ? confidenceOf(source.confidence?.name) ?? "high" : null,
    age: age != null ? confidenceOf(source.confidence?.age) ?? "high" : null,
    sex: sex ? sexConfidence : null,
    phone: phone ? confidenceOf(source.confidence?.phone) ?? "high" : null,
  };
  if (name && /\bbaby of\b/i.test(name)) confidence.name = "low";

  return { name, age, age_unit: ageUnit, sex, phone, confidence };
}

function readName(text) {
  const baby = text.match(/\bbaby of\s+([\p{L}][\p{L}.]*(?:\s+[\p{L}][\p{L}.]*){0,3})/iu);
  if (baby) {
    const name = normalizeExtractedName(`Baby of ${baby[1]}`);
    if (name) return { value: name, confidence: "low" };
  }
  const asked = text.match(new RegExp(
    `(?:what(?:'|’)?s your name|\\bname)\\??[\\s.:]*(?:patient\\s*:\\s*)?([\\p{L}][\\p{L}.]*(?:\\s+[\\p{L}][\\p{L}.]*){0,4})`,
    "iu",
  ));
  if (!asked) return null;
  const name = normalizeExtractedName(String(asked[1]).split(/[.,!?;]/)[0]);
  if (!name) return null;
  return { value: name, confidence: "high" };
}

function readAge(text) {
  const months = text.match(/\b(\d{1,3})\s*months?\b/i);
  if (months) {
    const age = Number(months[1]);
    if (age >= 0 && age < 24) return { value: age, unit: "months", confidence: "high" };
    if (age >= 24 && age <= 120 * 12) return { value: Math.round(age / 12), unit: "years", confidence: "high" };
  }
  const years = text.match(/\b(\d{1,3})\s*(?:years?|yrs?|year old|years old|vayasu|umar)\b/i);
  if (years) {
    const age = Number(years[1]);
    if (age >= 0 && age <= 120) return { value: age, unit: "years", confidence: "high" };
  }
  const asked = text.match(new RegExp(
    `\\bage\\??[\\s.:]*(?:patient\\s*:\\s*)?(${WORD_RE}(?:[\\s-]${WORD_RE})?|\\d{1,3})`,
    "i",
  ));
  if (!asked) return null;
  const age = /^\d+$/.test(asked[1]) ? Number(asked[1]) : wordNumber(asked[1]);
  if (age == null || age < 0 || age > 120) return null;
  return { value: age, unit: "years", confidence: "high" };
}

function readPhone(text) {
  const labeled = text.match(/(?:number|phone|mobile|cell)\D{0,12}(\d{10})\b/i);
  if (labeled) return labeled[1];
  const any = text.match(/\b(\d{10})\b/);
  return any ? any[1] : null;
}

/**
 * Deterministic read used by tests and as the fallback when the model is unavailable.
 * @param {string} text
 */
export function extractPatientFromTranscript(text) {
  const original = String(text ?? "");
  const prepared = collapseSpokenDigits(original);
  const name = readName(prepared);
  const age = readAge(prepared);
  const sex = explicitSex(original);
  const phone = normalizeExtractedPhone(readPhone(prepared));
  return normalizeExtractedPatient({
    name: name?.value ?? null,
    age: age?.value ?? null,
    age_unit: age?.unit ?? null,
    sex: sex?.value ?? null,
    phone,
    confidence: {
      name: name?.confidence ?? null,
      age: age?.confidence ?? null,
      sex: sex?.confidence ?? null,
      phone: phone ? "high" : null,
    },
  }, original);
}

export function detectionCardVisible(patient) {
  return Boolean(patient?.name) || patient?.age != null;
}

/**
 * @param {{ speechMs?: number, lastSpeechMs?: number|null, stopped?: boolean }} input
 */
export function extractionShouldRun({ speechMs = 0, lastSpeechMs = null, stopped = false } = {}) {
  if (stopped) return false;
  if (speechMs < FIRST_EXTRACT_MS) return false;
  if (lastSpeechMs == null) return true;
  return speechMs - lastSpeechMs >= EXTRACT_INTERVAL_MS;
}

export function formatDetectedLine(patient) {
  if (!patient) return "";
  const name = patient.name || "Name not heard";
  const age = patient.age == null
    ? null
    : patient.age_unit === "months"
      ? `${patient.age} months`
      : String(patient.age);
  const sex = patient.sex ? `${patient.sex.charAt(0).toUpperCase()}${patient.sex.slice(1)}` : null;
  const who = [name, age, sex].filter(Boolean).join(", ");
  const phone = patient.phone ? `Phone: ${patient.phone}` : "Phone: not heard";
  return `Detected: ${who}. ${phone}`;
}

export function sexLabel(sex) {
  if (sex === "male") return "Male";
  if (sex === "female") return "Female";
  if (sex === "other") return "Other";
  return "";
}

/**
 * @param {{ id?: string, patient_id?: string|null, status?: string }} session
 */
export function consultationAssignment(session = {}) {
  if (session.patient_id) return "attached";
  if (!session.status || session.status === "CREATED" || session.status === "draft") return "draft";
  return "unassigned";
}
