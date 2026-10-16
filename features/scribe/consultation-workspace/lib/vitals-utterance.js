/**
 * Deterministic vitals extractor for short "Say vitals" clips and the
 * consultation transcript. Never invents a number that was not spoken.
 */

import {
  buildObjectiveWithVitals,
  normalizeObjective,
} from "./vitals-objective.js";

export const EMPTY_VITALS = Object.freeze({
  bp_systolic: null,
  bp_diastolic: null,
  pulse: null,
  temp: null,
  temp_unit: null,
  spo2: null,
  weight: null,
  height: null,
  sugar: null,
  sugar_unit: null,
  sugar_type: null,
  rr: null,
});

const VITAL_KEYS = Object.keys(EMPTY_VITALS).filter(
  (key) => key !== "temp_unit" && key !== "sugar_unit" && key !== "sugar_type",
);

/** Amber "Check this value" bounds. Out-of-range readings are still kept. */
export const VITAL_CHECK_RANGES = Object.freeze({
  bp_systolic: { min: 60, max: 260 },
  bp_diastolic: { min: 30, max: 160 },
  pulse: { min: 30, max: 220 },
  spo2: { min: 50, max: 100 },
  weight: { min: 1, max: 300 },
  rr: { min: 6, max: 60 },
});

const ONES = {
  zero: 0, oh: 0,
  one: 1, ek: 1,
  two: 2, do: 2,
  three: 3, teen: 3,
  four: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, chhah: 6, cheh: 6,
  seven: 7, saat: 7,
  eight: 8, aath: 8,
  nine: 9, nau: 9,
  "ஒன்று": 1, "ஒன்னு": 1, ondru: 1, onru: 1,
  "இரண்டு": 2, irandu: 2,
  "மூன்று": 3, moondru: 3,
  "நான்கு": 4, naangu: 4,
  "ஐந்து": 5, ainthu: 5,
  "ஆறு": 6, aaru: 6,
  "ஏழு": 7, ezhu: 7,
  "எட்டு": 8, ettu: 8,
  "ஒன்பது": 9, onbathu: 9,
  "ఒకటి": 1, okati: 1,
  "రెండు": 2, rendu: 2,
  "మూడు": 3, moodu: 3,
  "నాలుగు": 4, nalugu: 4,
  "ఐదు": 5, aidu: 5,
  "ఆరు": 6,
  "ఏడు": 7, edu: 7,
  "ఎనిమిది": 8, enimidi: 8,
  "తొమ్మిది": 9, tommidi: 9,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5,
  "छह": 6, "सात": 7, "आठ": 8, "नौ": 9,
};

const TEENS = {
  ten: 10, das: 10,
  eleven: 11, gyarah: 11, gyara: 11,
  twelve: 12, barah: 12,
  thirteen: 13, terah: 13,
  fourteen: 14, chaudah: 14,
  fifteen: 15, pandrah: 15, pandra: 15,
  sixteen: 16, solah: 16,
  seventeen: 17, satrah: 17,
  eighteen: 18, atharah: 18, aatharah: 18,
  nineteen: 19, unnis: 19,
  "பத்து": 10, pathu: 10,
  "పది": 10, padi: 10,
  "दस": 10,
};

const TENS = {
  twenty: 20, bees: 20, bis: 20,
  thirty: 30, tees: 30, tis: 30,
  forty: 40, chalees: 40, chalis: 40,
  fifty: 50, pachaas: 50, pachas: 50, pachhas: 50,
  sixty: 60, saath: 60,
  seventy: 70, sattar: 70,
  eighty: 80, assi: 80,
  ninety: 90, nabbe: 90,
  "இருபது": 20, "இருபத்தி": 20,
  "முப்பது": 30, "முப்பத்தி": 30,
  "நாற்பது": 40, "நாற்பத்தி": 40,
  "ஐம்பது": 50, "ஐம்பத்தி": 50,
  "அறுபது": 60, "அறுபத்தி": 60,
  "எழுபது": 70, "எழுபத்தி": 70,
  "எண்பது": 80, "எண்பத்தி": 80,
  "தொண்ணூறு": 90, "தொண்ணூற்றி": 90,
  "ఇరవై": 20, iravai: 20,
  "ముప్పై": 30, muppai: 30,
  "నలభై": 40, nalabhai: 40,
  "యాభై": 50, yaabhai: 50,
  "అరవై": 60, aravai: 60,
  "డెబ్భై": 70, debhai: 70,
  "ఎనభై": 80, enabhai: 80,
  "తొంభై": 90, tombai: 90,
  "बीस": 20, "तीस": 30, "चालीस": 40, "पचास": 50,
  "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90,
};

const COMPOUNDS = {
  atthattar: 78, athhattar: 78, athatar: 78,
  athaasi: 88, athasi: 88,
  anthanve: 98, athanve: 98, anthanave: 98,
  "अठहत्तर": 78, "अट्ठासी": 88, "अट्ठानवे": 98,
};

const FILLER = new Set(["is", "was", "of", "the", "a", "an", "hai", "tha", "around", "about", "at", "reading", "and"]);
const HUNDRED = new Set(["hundred", "sau", "सौ", "நூறு", "nooru", "వంద", "vanda", "vandha"]);
const BP_SEPARATOR = new Set(["over", "by", "upon", "slash", "/"]);

/**
 * Spoken vitals often arrive as "Pulse, 98." The period is not a decimal,
 * and leaving it on the token makes the number unreadable.
 */
export function normalizeVitalsTranscript(text) {
  return String(text ?? "")
    .replace(/\bslash\b/gi, " / ")
    .replace(/(\d)\.(?!\d)/g, "$1 ")
    .replace(/(?<!\d)\.(?!\d)/g, " ")
    .replace(/[,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeVitalsTranscript(text)
    .toLowerCase()
    .replace(/°/g, " ")
    .replace(/\bb\.?\s*p\.?\b/g, " bp ")
    .replace(/\bs\s*p\s*o\s*2\b/g, " spo2 ")
    .replace(/%/g, " percent ")
    .replace(/\//g, " / ")
    .replace(/[^\p{L}\p{M}\p{N}.\s/]/gu, " ")
    .split(/\s+/)
    .filter((token) => token && token !== ".");
}

function readAtom(token) {
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    return { kind: "digit", value: Number(token) };
  }
  if (Object.prototype.hasOwnProperty.call(COMPOUNDS, token)) {
    return { kind: "compound", value: COMPOUNDS[token] };
  }
  if (Object.prototype.hasOwnProperty.call(ONES, token)) {
    return { kind: "ones", value: ONES[token] };
  }
  if (Object.prototype.hasOwnProperty.call(TEENS, token)) {
    return { kind: "teens", value: TEENS[token] };
  }
  if (Object.prototype.hasOwnProperty.call(TENS, token)) {
    return { kind: "tens", value: TENS[token] };
  }
  if (HUNDRED.has(token)) {
    return { kind: "hundred", value: 100 };
  }
  return null;
}

function consumeUnderHundred(tokens, start) {
  let index = start;
  if (tokens[index] === "and") index += 1;
  const atom = readAtom(tokens[index]);
  if (!atom || atom.kind === "hundred") return null;
  if (atom.kind === "tens") {
    let value = atom.value;
    index += 1;
    const ones = readAtom(tokens[index]);
    if (ones?.kind === "ones") {
      value += ones.value;
      index += 1;
    }
    return { value, index };
  }
  if (atom.kind === "ones" || atom.kind === "teens" || atom.kind === "compound" || atom.kind === "digit") {
    return { value: atom.value, index: index + 1 };
  }
  return null;
}

/**
 * @param {string[]} tokens
 * @param {number} start
 * @returns {{ value: number, index: number } | null}
 */
export function consumeSpokenNumber(tokens, start) {
  const first = readAtom(tokens[start]);
  if (!first) return null;
  let index = start + 1;
  let value = first.value;

  if (first.kind === "ones") {
    const next = readAtom(tokens[index]);
    if (next?.kind === "hundred") {
      value = first.value * 100;
      index += 1;
      const rest = consumeUnderHundred(tokens, index);
      if (rest) {
        value += rest.value;
        index = rest.index;
      }
    } else if (next?.kind === "tens") {
      value = first.value * 100 + next.value;
      index += 1;
      const ones = readAtom(tokens[index]);
      if (ones?.kind === "ones") {
        value += ones.value;
        index += 1;
      }
    }
  } else if (first.kind === "hundred") {
    value = 100;
    const rest = consumeUnderHundred(tokens, index);
    if (rest) {
      value += rest.value;
      index = rest.index;
    }
  } else if (first.kind === "tens") {
    const ones = readAtom(tokens[index]);
    if (ones?.kind === "ones") {
      value += ones.value;
      index += 1;
    }
  }

  if (tokens[index] === "point" || tokens[index] === "decimal") {
    const fracToken = tokens[index + 1];
    const frac = readAtom(fracToken);
    if (frac && (frac.kind === "ones" || frac.kind === "digit") && !String(fracToken).includes(".")) {
      const digits = String(frac.value);
      value = Number(`${Math.trunc(value)}.${digits}`);
      index += 2;
    }
  }

  return { value, index };
}

const SUGAR_WORDS = new Set([
  "sugar", "shugar", "glucose", "cheeni",
  "சர்க்கரை", "చక్కెర", "शक्कर", "चीनी",
]);

function sugarTypeFrom(token) {
  if (token === "random" || token === "rbs") return "random";
  if (token === "fasting" || token === "fbs") return "fasting";
  if (token === "pp" || token === "ppbs" || token === "postprandial") return "pp";
  return null;
}

function sugarLabel(tokens, index) {
  const token = tokens[index];
  const next = tokens[index + 1];
  const after = tokens[index + 2];

  if (token === "post" && next === "prandial") {
    let end = index + 2;
    if (after === "blood" && SUGAR_WORDS.has(tokens[index + 3])) end = index + 4;
    else if (SUGAR_WORDS.has(after) || after === "blood") end = index + 3;
    return { field: "sugar", sugarType: "pp", index: end };
  }
  if ((token === "random" || token === "fasting") && (SUGAR_WORDS.has(next) || next === "blood")) {
    let end = index + 2;
    if (next === "blood" && SUGAR_WORDS.has(after)) end = index + 3;
    return { field: "sugar", sugarType: token === "fasting" ? "fasting" : "random", index: end };
  }
  if (token === "rbs") return { field: "sugar", sugarType: "random", index: index + 1 };
  if (token === "fbs") return { field: "sugar", sugarType: "fasting", index: index + 1 };
  if (token === "ppbs") return { field: "sugar", sugarType: "pp", index: index + 1 };
  if (token === "pp" && (SUGAR_WORDS.has(next) || next === "blood" || readAtom(next))) {
    let end = index + 1;
    if (next === "blood" && SUGAR_WORDS.has(after)) end = index + 3;
    else if (SUGAR_WORDS.has(next) || next === "blood") end = index + 2;
    return { field: "sugar", sugarType: "pp", index: end };
  }
  if (token === "blood" && SUGAR_WORDS.has(next)) {
    return { field: "sugar", sugarType: sugarTypeFrom(tokens[index - 1]), index: index + 2 };
  }
  if (SUGAR_WORDS.has(token)) {
    return { field: "sugar", sugarType: sugarTypeFrom(tokens[index - 1]), index: index + 1 };
  }
  return null;
}

function readSugarUnit(tokens, index) {
  const token = tokens[index];
  if (token === "mmol" || token === "millimole" || token === "millimoles") {
    const step = tokens[index + 1] === "/" ? 2 : 1;
    const unitToken = tokens[index + 1] === "/" ? tokens[index + 2] : tokens[index + 1];
    if (unitToken === "l" || unitToken === "liter" || unitToken === "litre" || tokens[index + 1] == null || tokens[index + 1] === "/") {
      const end = unitToken === "l" || unitToken === "liter" || unitToken === "litre" ? index + step + 1 : index + 1;
      return { unit: "mmol/L", index: end };
    }
  }
  if (token === "mg" || token === "milligram" || token === "milligrams") {
    let cursor = index + 1;
    if (tokens[cursor] === "/") cursor += 1;
    if (tokens[cursor] === "dl" || tokens[cursor] === "deciliter" || tokens[cursor] === "decilitre") {
      return { unit: "mg/dL", index: cursor + 1 };
    }
  }
  return null;
}

function labelAt(tokens, index) {
  const token = tokens[index];
  const next = tokens[index + 1];
  const sugar = sugarLabel(tokens, index);
  if (sugar) return sugar;
  if (token === "blood" && next === "pressure") return { field: "bp", index: index + 2 };
  if (token === "இரத்த" && next === "அழுத்தம்") return { field: "bp", index: index + 2 };
  if (token === "heart" && next === "rate") return { field: "pulse", index: index + 2 };
  if (token === "respiratory" && next === "rate") return { field: "rr", index: index + 2 };
  if (token === "breathing" && next === "rate") return { field: "rr", index: index + 2 };
  if (token === "respiration") return { field: "rr", index: index + 1 };
  if ((token === "o2" || token === "oxygen") && (next === "sat" || next === "saturation")) {
    return { field: "spo2", index: index + 2 };
  }
  if (token === "bp" || token === "రక్తపోటు" || token === "रक्तचाप") return { field: "bp", index: index + 1 };
  if (
    token === "pulse" || token === "hr" || token === "nabz" || token === "nadi" || token === "naadi"
    || token === "நாடி" || token === "నాడి" || token === "नाड़ी" || token === "नब्ज"
  ) {
    return { field: "pulse", index: index + 1 };
  }
  if (
    token === "temp" || token === "temperature" || token === "bukhar" || token === "taap" || token === "taapman"
    || token === "வெப்பநிலை" || token === "ఉష్ణోగ్రత" || token === "तापमान" || token === "बुखार"
  ) {
    return { field: "temp", index: index + 1 };
  }
  if (token === "spo2" || token === "oxygen" || token === "saturation") {
    return { field: "spo2", index: index + 1 };
  }
  if (
    token === "weight" || token === "wazan" || token === "vazan" || token === "vajan" || token === "wt"
    || token === "எடை" || token === "బరువు" || token === "वजन"
  ) {
    return { field: "weight", index: index + 1 };
  }
  if (
    token === "height" || token === "ht" || token === "lambai" || token === "unchai" || token === "kad"
    || token === "உயரம்" || token === "ఎత్తు" || token === "ऊंचाई"
  ) {
    return { field: "height", index: index + 1 };
  }
  if (
    token === "rr" || token === "resp" || token === "breaths" || token === "saans" || token === "shwas"
    || token === "சுவாசம்" || token === "மூச்சு" || token === "శ్వాస" || token === "श्वास"
  ) {
    return { field: "rr", index: index + 1 };
  }
  return null;
}

function skipFiller(tokens, index) {
  let cursor = index;
  while (FILLER.has(tokens[cursor])) cursor += 1;
  return cursor;
}

function markUsed(used, from, to) {
  for (let index = from; index < to; index += 1) used.add(index);
}

function readUnit(tokens, index) {
  const token = tokens[index];
  if (token === "f" || token === "fahrenheit") return { unit: "F", index: index + 1 };
  if (token === "c" || token === "celsius" || token === "centigrade") return { unit: "C", index: index + 1 };
  return null;
}

function readHeight(tokens, index, used) {
  const cursor = skipFiller(tokens, index);
  const feet = consumeSpokenNumber(tokens, cursor);
  if (!feet) return null;
  const unit = tokens[feet.index];
  if (unit === "feet" || unit === "foot" || unit === "ft") {
    let cm = feet.value * 30.48;
    let next = feet.index + 1;
    const inches = consumeSpokenNumber(tokens, next);
    if (inches && (tokens[inches.index] === "inches" || tokens[inches.index] === "inch" || tokens[inches.index] === "in")) {
      cm += inches.value * 2.54;
      next = inches.index + 1;
    } else if (inches && inches.value <= 11) {
      cm += inches.value * 2.54;
      next = inches.index;
    }
    markUsed(used, cursor, next);
    return { value: Math.round(cm * 10) / 10, index: next };
  }
  const cmUnit = unit === "cm" || unit === "centimeter" || unit === "centimeters"
    || unit === "centimetre" || unit === "centimetres";
  if (cmUnit || feet.value >= 40) {
    const next = cmUnit ? feet.index + 1 : feet.index;
    markUsed(used, cursor, next);
    return { value: feet.value, index: next };
  }
  return null;
}

function collectSpokenNumbers(text) {
  const tokens = tokenize(text);
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const spoken = consumeSpokenNumber(tokens, index);
    if (!spoken) continue;
    values.push(spoken.value);
    index = spoken.index - 1;
  }
  return values;
}

function numberWasSpoken(text, value) {
  if (value == null) return true;
  return collectSpokenNumbers(text).some((spoken) => Math.abs(spoken - Number(value)) < 0.051);
}

/**
 * @param {string} text
 * @returns {typeof EMPTY_VITALS}
 */
export function extractVitalsFromUtterance(text) {
  const tokens = tokenize(text);
  const result = { ...EMPTY_VITALS };
  const used = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    if (used.has(index)) continue;
    const label = labelAt(tokens, index);
    if (!label) continue;
    if (label.field === "ignore") {
      const skipped = consumeSpokenNumber(tokens, skipFiller(tokens, label.index));
      markUsed(used, index, skipped ? skipped.index : label.index);
      index = (skipped ? skipped.index : label.index) - 1;
      continue;
    }
    if (label.field === "height") {
      const height = readHeight(tokens, label.index, used);
      if (height) {
        result.height = height.value;
        markUsed(used, index, height.index);
        index = height.index - 1;
      }
      continue;
    }
    const cursor = skipFiller(tokens, label.index);
    const spoken = consumeSpokenNumber(tokens, cursor);
    if (!spoken) continue;
    markUsed(used, index, spoken.index);

    if (label.field === "bp") {
      result.bp_systolic = spoken.value;
      let after = skipFiller(tokens, spoken.index);
      if (BP_SEPARATOR.has(tokens[after])) {
        after = skipFiller(tokens, after + 1);
        const diastolic = consumeSpokenNumber(tokens, after);
        if (diastolic) {
          result.bp_diastolic = diastolic.value;
          markUsed(used, spoken.index, diastolic.index);
          index = diastolic.index - 1;
          continue;
        }
      }
      index = spoken.index - 1;
      continue;
    }

    if (label.field === "pulse") result.pulse = spoken.value;
    if (label.field === "rr") result.rr = spoken.value;
    if (label.field === "spo2") result.spo2 = spoken.value;
    if (label.field === "weight") result.weight = spoken.value;
    if (label.field === "temp") {
      result.temp = spoken.value;
      const unit = readUnit(tokens, spoken.index);
      result.temp_unit = unit ? unit.unit : null;
      if (unit) markUsed(used, spoken.index, unit.index);
    }
    if (label.field === "sugar") {
      result.sugar = spoken.value;
      result.sugar_type = label.sugarType ?? null;
      const unit = readSugarUnit(tokens, spoken.index);
      result.sugar_unit = unit ? unit.unit : null;
      if (unit) markUsed(used, spoken.index, unit.index);
    }
    index = spoken.index - 1;
  }

  if (result.temp == null) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (used.has(index)) continue;
      const spoken = consumeSpokenNumber(tokens, index);
      if (!spoken || used.has(index)) continue;
      const unit = readUnit(tokens, spoken.index);
      if (!unit) continue;
      result.temp = spoken.value;
      result.temp_unit = unit.unit;
      markUsed(used, index, unit.index);
      break;
    }
  }

  if (result.bp_systolic == null) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (used.has(index)) continue;
      const systolic = consumeSpokenNumber(tokens, index);
      if (!systolic) continue;
      let after = skipFiller(tokens, systolic.index);
      if (!BP_SEPARATOR.has(tokens[after])) continue;
      after = skipFiller(tokens, after + 1);
      if (used.has(after)) continue;
      const diastolic = consumeSpokenNumber(tokens, after);
      if (!diastolic) continue;
      result.bp_systolic = systolic.value;
      result.bp_diastolic = diastolic.value;
      break;
    }
  }

  return roundVitals(result);
}

function roundVitals(vitals) {
  const next = { ...vitals };
  for (const key of ["bp_systolic", "bp_diastolic", "pulse", "spo2", "rr"]) {
    if (next[key] != null) next[key] = Math.round(next[key]);
  }
  if (next.temp != null) next.temp = Math.round(next.temp * 10) / 10;
  if (next.weight != null) next.weight = Math.round(next.weight * 10) / 10;
  if (next.height != null) next.height = Math.round(next.height * 10) / 10;
  if (next.sugar != null) next.sugar = Math.round(next.sugar * 10) / 10;
  if (next.temp == null) next.temp_unit = null;
  if (next.sugar == null) {
    next.sugar_unit = null;
    next.sugar_type = null;
  }
  return next;
}

export function hasExtractedVital(vitals) {
  return VITAL_KEYS.some((key) => vitals?.[key] != null);
}

function mentionsUnparsedVital(text) {
  return /\b(bp|b\.?p\.?|blood pressure|pulse|heart rate|hr|nabz|temp|temperature|bukhar|spo2|oxygen|saturation|weight|wazan|height|lambai|sugar|shugar|rbs|fbs|ppbs|rr|respiratory|breaths)\b/i
    .test(String(text))
    && !hasExtractedVital(extractVitalsFromUtterance(text));
}

/**
 * Parser first. A model may fill leftover fields only when the utterance
 * names a vital the parser missed, and only with numbers that were spoken.
 *
 * @param {string} text
 * @param {{ complete?: (text: string) => Promise<Partial<typeof EMPTY_VITALS>> }} [options]
 */
export async function extractVitals(text, options = {}) {
  const parsed = extractVitalsFromUtterance(text);
  if (!options.complete || hasExtractedVital(parsed) || !mentionsUnparsedVital(text)) {
    return parsed;
  }
  let model;
  try {
    model = await options.complete(text);
  } catch {
    return parsed;
  }
  return guardModelVitals(text, model);
}

export function guardModelVitals(text, model) {
  const next = { ...EMPTY_VITALS };
  if (!model || typeof model !== "object") return next;
  for (const key of VITAL_KEYS) {
    const value = model[key];
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    if (!numberWasSpoken(text, numeric)) continue;
    next[key] = numeric;
  }
  const unit = model.temp_unit === "C" || model.temp_unit === "F" ? model.temp_unit : null;
  next.temp_unit = next.temp == null ? null : unit;
  if (next.sugar == null) {
    next.sugar_unit = null;
    next.sugar_type = null;
  } else {
    if (model.sugar_unit === "mmol/L" && /\bmmol\b/i.test(text)) next.sugar_unit = "mmol/L";
    else if ((model.sugar_unit === "mg/dL" || model.sugar_unit === "mg/dl") && /\bmg\b/i.test(text)) {
      next.sugar_unit = "mg/dL";
    } else next.sugar_unit = null;
    if (model.sugar_type === "fasting" && /\b(fasting|fbs)\b/i.test(text)) next.sugar_type = "fasting";
    else if (model.sugar_type === "pp" && /\b(pp|ppbs|postprandial|post prandial)\b/i.test(text)) next.sugar_type = "pp";
    else if (model.sugar_type === "random" && /\b(random|rbs)\b/i.test(text)) next.sugar_type = "random";
    else next.sugar_type = null;
  }
  return roundVitals(next);
}

/**
 * @param {Partial<typeof EMPTY_VITALS>} vitals
 * @returns {Record<string, true>}
 */
export function vitalRangeFlags(vitals = {}) {
  const flags = {};
  for (const [key, range] of Object.entries(VITAL_CHECK_RANGES)) {
    const value = vitals[key];
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    if (numeric < range.min || numeric > range.max) flags[key] = true;
  }
  if (vitals.temp != null && vitals.temp !== "") {
    const temp = Number(vitals.temp);
    const unit = vitals.temp_unit === "C" ? "C" : "F";
    const low = unit === "C" ? 32 : 90;
    const high = unit === "C" ? 42 : 108;
    if (Number.isFinite(temp) && (temp < low || temp > high)) flags.temp = true;
  }
  if (vitals.sugar != null && vitals.sugar !== "") {
    const sugar = Number(vitals.sugar);
    const mg = vitals.sugar_unit === "mmol/L" ? sugar * 18 : sugar;
    if (Number.isFinite(mg) && (mg < 30 || mg > 600)) flags.sugar = true;
  }
  return flags;
}

/**
 * @param {{
 *   current: Record<string, string|number|null>,
 *   extracted: Partial<typeof EMPTY_VITALS>,
 *   typedFields?: Iterable<string>,
 *   mode?: "voice"|"transcript",
 *   confirmTyped?: boolean,
 * }} input
 */
export function applyVitalsAutofill({
  current,
  extracted,
  typedFields = [],
  mode = "voice",
  confirmTyped = false,
}) {
  const typed = new Set(typedFields);
  const next = { ...current };
  if (mode !== "voice" && mode !== "transcript") return { next, filled: [], skipped: [] };
  const filled = [];
  const skipped = [];
  for (const key of [...VITAL_KEYS, "temp_unit", "sugar_unit", "sugar_type"]) {
    if (key === "temp_unit") {
      if (extracted.temp == null || !filled.includes("temp")) continue;
      if (typed.has("temp_unit") && !confirmTyped) continue;
      next.temp_unit = extracted.temp_unit ?? next.temp_unit ?? null;
      continue;
    }
    if (key === "sugar_unit" || key === "sugar_type") {
      if (extracted.sugar == null || !filled.includes("sugar") || extracted[key] == null) continue;
      next[key] = extracted[key];
      continue;
    }
    if (extracted[key] == null) continue;
    const existing = current[key];
    const hasExisting = existing != null && String(existing).trim() !== "";
    if (hasExisting && typed.has(key) && !confirmTyped) {
      skipped.push(key);
      continue;
    }
    if (hasExisting && String(existing) === String(extracted[key])) continue;
    next[key] = extracted[key];
    filled.push(key);
  }
  return { next, filled, skipped };
}

export function formatSugarReading(vitals) {
  const kind = vitals.sugar_type === "fasting" || vitals.sugarType === "fasting"
    ? "FBS"
    : vitals.sugar_type === "pp" || vitals.sugarType === "pp"
      ? "PP"
      : vitals.sugar_type === "random" || vitals.sugarType === "random"
        ? "RBS"
        : "Sugar";
  const unit = vitals.sugar_unit === "mmol/L" || vitals.sugarUnit === "mmol/L" ? "mmol/L" : "mg/dL";
  return `${kind}: ${vitals.sugar} ${unit}`;
}

export function formatVisitVitalsPrompt(vitals) {
  if (!vitals) return "";
  const lines = [];
  if (vitals.bp_systolic != null || vitals.bp_diastolic != null) {
    lines.push(`BP: ${vitals.bp_systolic ?? "—"}/${vitals.bp_diastolic ?? "—"} mmHg`);
  }
  if (vitals.pulse != null) lines.push(`Pulse: ${vitals.pulse} bpm`);
  if (vitals.temp != null) {
    const unit = vitals.temp_unit === "C" ? "°C" : "°F";
    lines.push(`Temp: ${vitals.temp} ${unit}`);
  }
  if (vitals.spo2 != null) lines.push(`SpO2: ${vitals.spo2}%`);
  if (vitals.weight != null) lines.push(`Weight: ${vitals.weight} kg`);
  if (vitals.height != null) lines.push(`Height: ${vitals.height} cm`);
  if (vitals.rr != null) lines.push(`RR: ${vitals.rr}/min`);
  if (vitals.sugar != null) lines.push(formatSugarReading(vitals));
  if (!lines.length) return "";
  return [
    "VISIT VITALS (measured for this visit — copy these into Objective as the vitals line. Do not change these numbers and do not invent any measurement that is not listed here or spoken in the transcript):",
    ...lines,
  ].join("\n");
}

/**
 * Measured visit vitals become the Objective vitals line. Exam text stays.
 *
 * @param {string} objectiveText
 * @param {Partial<typeof EMPTY_VITALS>|null|undefined} visit
 */
export function mergeVisitVitalsIntoObjective(objectiveText, visit) {
  if (!visit || !hasExtractedVital(visit)) return objectiveText ?? "";
  const normalized = normalizeObjective(objectiveText);
  const vitals = { ...normalized.vitals };
  if (visit.bp_systolic != null) vitals.bpSys = String(visit.bp_systolic);
  if (visit.bp_diastolic != null) vitals.bpDia = String(visit.bp_diastolic);
  if (visit.pulse != null) vitals.hr = String(visit.pulse);
  if (visit.temp != null) {
    vitals.temp = String(visit.temp);
    vitals.tempUnit = visit.temp_unit === "C" ? "C" : "F";
  }
  if (visit.spo2 != null) vitals.spo2 = String(visit.spo2);
  if (visit.weight != null) vitals.weight = String(visit.weight);
  if (visit.height != null) vitals.height = String(visit.height);
  if (visit.rr != null) vitals.rr = String(visit.rr);
  if (visit.sugar != null) {
    vitals.sugar = String(visit.sugar);
    vitals.sugarUnit = visit.sugar_unit === "mmol/L" ? "mmol/L" : "mg/dL";
    vitals.sugarType = visit.sugar_type ?? "";
  }
  let text = buildObjectiveWithVitals(
    vitals,
    [normalized.exam, normalized.investigations ? `Investigations: ${normalized.investigations}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  );
  return text;
}
