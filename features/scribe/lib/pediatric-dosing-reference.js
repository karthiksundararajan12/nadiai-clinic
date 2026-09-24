/**
 * Advisory pediatric dosing reference for the ~26 most common Indian
 * outpatient pediatric drugs (matched against the brand-name dropdown).
 *
 * These are starting-point ranges for a SUGGESTED chip — never auto-approved.
 * Values follow commonly cited IAP / Nelson-style outpatient starting doses
 * and are intentionally conservative on maxima. Not a formulary and not a
 * substitute for the doctor's own protocol.
 */

/**
 * @typedef {{ minMonths: number; maxMonths: number; doseMg: number }} AgeBand
 * @typedef {{ maxKg: number; doseMg: number }} WeightBand
 * @typedef {{
 *   id: string;
 *   genericName: string;
 *   aliases: string[];
 *   mgPerKgDose: number|null;
 *   frequency: string;
 *   timesPerDay: number;
 *   maxSingleDoseMg: number;
 *   maxDailyDoseMg: number;
 *   maxDailyMgPerKg?: number;
 *   minAgeMonths: number;
 *   ageBands?: AgeBand[];
 *   weightBands?: WeightBand[];
 * }} PediatricDosingEntry
 */

/** @type {ReadonlyArray<PediatricDosingEntry>} */
export const PEDIATRIC_DOSING_REFERENCE = Object.freeze([
  {
    id: "paracetamol",
    genericName: "Paracetamol",
    aliases: ["paracetamol", "acetaminophen", "crocin", "dolo", "calpol", "pcm", "crocin ds"],
    mgPerKgDose: 15,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 1000,
    maxDailyDoseMg: 4000,
    maxDailyMgPerKg: 60,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 2, maxMonths: 3, doseMg: 60 },
      { minMonths: 4, maxMonths: 11, doseMg: 120 },
      { minMonths: 12, maxMonths: 23, doseMg: 150 },
      { minMonths: 24, maxMonths: 47, doseMg: 180 },
      { minMonths: 48, maxMonths: 71, doseMg: 240 },
      { minMonths: 72, maxMonths: 143, doseMg: 375 },
      { minMonths: 144, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "ibuprofen",
    genericName: "Ibuprofen",
    aliases: ["ibuprofen", "ibugesic", "brufen", "ibrumax", "ibugesic plus"],
    mgPerKgDose: 10,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 400,
    maxDailyDoseMg: 1200,
    maxDailyMgPerKg: 40,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 11, doseMg: 50 },
      { minMonths: 12, maxMonths: 23, doseMg: 75 },
      { minMonths: 24, maxMonths: 47, doseMg: 100 },
      { minMonths: 48, maxMonths: 71, doseMg: 150 },
      { minMonths: 72, maxMonths: 143, doseMg: 200 },
      { minMonths: 144, maxMonths: 215, doseMg: 300 },
    ],
  },
  {
    id: "mefenamic_acid",
    genericName: "Mefenamic acid",
    aliases: ["mefenamic", "meftal-p", "meftal p", "meftal"],
    mgPerKgDose: 6.5,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 250,
    maxDailyDoseMg: 500,
    maxDailyMgPerKg: 20,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 50 },
      { minMonths: 24, maxMonths: 71, doseMg: 100 },
      { minMonths: 72, maxMonths: 215, doseMg: 250 },
    ],
  },
  {
    id: "amoxicillin",
    genericName: "Amoxicillin",
    aliases: ["amoxicillin", "amoxycillin", "novamox", "moxikind", "mox "],
    mgPerKgDose: 25,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 1000,
    maxDailyDoseMg: 3000,
    maxDailyMgPerKg: 90,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 11, doseMg: 125 },
      { minMonths: 12, maxMonths: 59, doseMg: 250 },
      { minMonths: 60, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "amoxicillin_clavulanate",
    genericName: "Amoxicillin-clavulanate",
    aliases: ["amoxicillin-clavulanate", "amox clav", "augmentin", "clavam", "moxclav", "augmentin duo"],
    mgPerKgDose: 25,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 875,
    maxDailyDoseMg: 1750,
    maxDailyMgPerKg: 70,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 11, doseMg: 125 },
      { minMonths: 12, maxMonths: 71, doseMg: 228 },
      { minMonths: 72, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "azithromycin",
    genericName: "Azithromycin",
    aliases: ["azithromycin", "azithral", "azee", "azibact", "azithral xl"],
    mgPerKgDose: 10,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 500,
    maxDailyDoseMg: 500,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 100 },
      { minMonths: 24, maxMonths: 71, doseMg: 200 },
      { minMonths: 72, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "cefixime",
    genericName: "Cefixime",
    aliases: ["cefixime", "taxim-o", "taxim o", "zifi", "mahacef"],
    mgPerKgDose: 8,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 400,
    maxDailyDoseMg: 400,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 50 },
      { minMonths: 24, maxMonths: 71, doseMg: 100 },
      { minMonths: 72, maxMonths: 215, doseMg: 200 },
    ],
  },
  {
    id: "cefpodoxime",
    genericName: "Cefpodoxime",
    aliases: ["cefpodoxime", "cepodem", "gudcef"],
    mgPerKgDose: 5,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 200,
    maxDailyDoseMg: 400,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 40 },
      { minMonths: 24, maxMonths: 71, doseMg: 80 },
      { minMonths: 72, maxMonths: 215, doseMg: 200 },
    ],
  },
  {
    id: "cephalexin",
    genericName: "Cephalexin",
    aliases: ["cephalexin", "cefalexin", "phexin", "sporidex", "cefakind"],
    mgPerKgDose: 12.5,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 500,
    maxDailyDoseMg: 2000,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 11, doseMg: 125 },
      { minMonths: 12, maxMonths: 71, doseMg: 250 },
      { minMonths: 72, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "cefuroxime",
    genericName: "Cefuroxime",
    aliases: ["cefuroxime", "ceftum", "zinnat"],
    mgPerKgDose: 15,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 500,
    maxDailyDoseMg: 1000,
    minAgeMonths: 3,
    ageBands: [
      { minMonths: 3, maxMonths: 23, doseMg: 125 },
      { minMonths: 24, maxMonths: 71, doseMg: 250 },
      { minMonths: 72, maxMonths: 215, doseMg: 500 },
    ],
  },
  {
    id: "clarithromycin",
    genericName: "Clarithromycin",
    aliases: ["clarithromycin", "claribid", "clarithro"],
    mgPerKgDose: 7.5,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 500,
    maxDailyDoseMg: 1000,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 62.5 },
      { minMonths: 24, maxMonths: 71, doseMg: 125 },
      { minMonths: 72, maxMonths: 215, doseMg: 250 },
    ],
  },
  {
    id: "cotrimoxazole",
    genericName: "Cotrimoxazole (TMP)",
    aliases: ["cotrimoxazole", "sulfamethoxazole", "septran", "bactrim", "septran paediatric"],
    mgPerKgDose: 4,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 160,
    maxDailyDoseMg: 320,
    minAgeMonths: 2,
    ageBands: [
      { minMonths: 2, maxMonths: 5, doseMg: 20 },
      { minMonths: 6, maxMonths: 23, doseMg: 40 },
      { minMonths: 24, maxMonths: 71, doseMg: 80 },
      { minMonths: 72, maxMonths: 215, doseMg: 160 },
    ],
  },
  {
    id: "metronidazole",
    genericName: "Metronidazole",
    aliases: ["metronidazole", "flagyl", "metrogyl"],
    mgPerKgDose: 7.5,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 500,
    maxDailyDoseMg: 2000,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 23, doseMg: 50 },
      { minMonths: 24, maxMonths: 71, doseMg: 100 },
      { minMonths: 72, maxMonths: 215, doseMg: 200 },
    ],
  },
  {
    id: "cetirizine",
    genericName: "Cetirizine",
    aliases: ["cetirizine", "cetzine", "alerid", "okacet"],
    mgPerKgDose: 0.25,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 10,
    maxDailyDoseMg: 10,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 2.5 },
      { minMonths: 24, maxMonths: 71, doseMg: 5 },
      { minMonths: 72, maxMonths: 215, doseMg: 10 },
    ],
  },
  {
    id: "levocetirizine",
    genericName: "Levocetirizine",
    aliases: ["levocetirizine", "levocet", "xyzal", "levosiz"],
    mgPerKgDose: null,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 5,
    maxDailyDoseMg: 5,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 1.25 },
      { minMonths: 24, maxMonths: 71, doseMg: 2.5 },
      { minMonths: 72, maxMonths: 215, doseMg: 5 },
    ],
  },
  {
    id: "ondansetron",
    genericName: "Ondansetron",
    aliases: ["ondansetron", "ondem", "emeset", "vomikind"],
    mgPerKgDose: 0.15,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 8,
    maxDailyDoseMg: 16,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 23, doseMg: 2 },
      { minMonths: 24, maxMonths: 71, doseMg: 4 },
      { minMonths: 72, maxMonths: 215, doseMg: 8 },
    ],
  },
  {
    id: "domperidone",
    genericName: "Domperidone",
    aliases: ["domperidone", "domstal", "motinorm"],
    mgPerKgDose: 0.25,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 10,
    maxDailyDoseMg: 30,
    minAgeMonths: 12,
    ageBands: [
      { minMonths: 12, maxMonths: 71, doseMg: 2.5 },
      { minMonths: 72, maxMonths: 215, doseMg: 5 },
    ],
  },
  {
    id: "albendazole",
    genericName: "Albendazole",
    aliases: ["albendazole", "zentel", "noworm", "bendex"],
    mgPerKgDose: null,
    frequency: "STAT",
    timesPerDay: 1,
    maxSingleDoseMg: 400,
    maxDailyDoseMg: 400,
    minAgeMonths: 12,
    weightBands: [
      { maxKg: 10, doseMg: 200 },
      { maxKg: Number.POSITIVE_INFINITY, doseMg: 400 },
    ],
    ageBands: [
      { minMonths: 12, maxMonths: 23, doseMg: 200 },
      { minMonths: 24, maxMonths: 215, doseMg: 400 },
    ],
  },
  {
    id: "zinc",
    genericName: "Zinc",
    aliases: ["zinc", "zinconia", "z&d", "z and d"],
    mgPerKgDose: null,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 20,
    maxDailyDoseMg: 20,
    minAgeMonths: 2,
    ageBands: [
      { minMonths: 2, maxMonths: 5, doseMg: 10 },
      { minMonths: 6, maxMonths: 215, doseMg: 20 },
    ],
  },
  {
    id: "montelukast",
    genericName: "Montelukast",
    aliases: ["montelukast", "montair", "singulair"],
    mgPerKgDose: null,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 10,
    maxDailyDoseMg: 10,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 71, doseMg: 4 },
      { minMonths: 72, maxMonths: 167, doseMg: 5 },
      { minMonths: 168, maxMonths: 215, doseMg: 10 },
    ],
  },
  {
    id: "salbutamol",
    genericName: "Salbutamol",
    aliases: ["salbutamol", "albuterol", "asthalin", "ventorlin"],
    mgPerKgDose: 0.1,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 4,
    maxDailyDoseMg: 12,
    minAgeMonths: 24,
    ageBands: [
      { minMonths: 24, maxMonths: 71, doseMg: 1 },
      { minMonths: 72, maxMonths: 143, doseMg: 2 },
      { minMonths: 144, maxMonths: 215, doseMg: 4 },
    ],
  },
  {
    id: "prednisolone",
    genericName: "Prednisolone",
    aliases: ["prednisolone", "wysolone", "predone"],
    mgPerKgDose: 1,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 40,
    maxDailyDoseMg: 40,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 35, doseMg: 5 },
      { minMonths: 36, maxMonths: 71, doseMg: 10 },
      { minMonths: 72, maxMonths: 143, doseMg: 20 },
      { minMonths: 144, maxMonths: 215, doseMg: 30 },
    ],
  },
  {
    id: "fluconazole",
    genericName: "Fluconazole",
    aliases: ["fluconazole", "zocon", "syscan"],
    mgPerKgDose: 3,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 150,
    maxDailyDoseMg: 150,
    minAgeMonths: 1,
    ageBands: [
      { minMonths: 1, maxMonths: 23, doseMg: 25 },
      { minMonths: 24, maxMonths: 71, doseMg: 50 },
      { minMonths: 72, maxMonths: 215, doseMg: 100 },
    ],
  },
  {
    id: "ferrous",
    genericName: "Elemental iron",
    aliases: ["ferrous", "fersolate", "ferrochelate", "iron syrup", "iron drops"],
    mgPerKgDose: 3,
    frequency: "OD",
    timesPerDay: 1,
    maxSingleDoseMg: 60,
    maxDailyDoseMg: 60,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 15 },
      { minMonths: 24, maxMonths: 71, doseMg: 20 },
      { minMonths: 72, maxMonths: 215, doseMg: 30 },
    ],
  },
  {
    id: "hydroxyzine",
    genericName: "Hydroxyzine",
    aliases: ["hydroxyzine", "atarax"],
    mgPerKgDose: 0.5,
    frequency: "TDS",
    timesPerDay: 3,
    maxSingleDoseMg: 25,
    maxDailyDoseMg: 50,
    minAgeMonths: 6,
    ageBands: [
      { minMonths: 6, maxMonths: 23, doseMg: 5 },
      { minMonths: 24, maxMonths: 71, doseMg: 10 },
      { minMonths: 72, maxMonths: 215, doseMg: 15 },
    ],
  },
  {
    id: "oseltamivir",
    genericName: "Oseltamivir",
    aliases: ["oseltamivir", "tamiflu", "fluvir"],
    mgPerKgDose: null,
    frequency: "BD",
    timesPerDay: 2,
    maxSingleDoseMg: 75,
    maxDailyDoseMg: 150,
    minAgeMonths: 1,
    weightBands: [
      { maxKg: 15, doseMg: 30 },
      { maxKg: 23, doseMg: 45 },
      { maxKg: 40, doseMg: 60 },
      { maxKg: Number.POSITIVE_INFINITY, doseMg: 75 },
    ],
    ageBands: [
      { minMonths: 1, maxMonths: 11, doseMg: 30 },
      { minMonths: 12, maxMonths: 71, doseMg: 45 },
      { minMonths: 72, maxMonths: 215, doseMg: 75 },
    ],
  },
]);

export const PEDIATRIC_DOSING_REFERENCE_COUNT = PEDIATRIC_DOSING_REFERENCE.length;

/**
 * @param {string|null|undefined} rawName
 * @returns {string}
 */
export function normalizeDrugNameForMatch(rawName) {
  return String(rawName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9&+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string|null|undefined} drugName
 * @param {ReadonlyArray<PediatricDosingEntry>} [catalog]
 * @returns {PediatricDosingEntry|null}
 */
export function findPediatricDosingEntry(drugName, catalog = PEDIATRIC_DOSING_REFERENCE) {
  const normalized = normalizeDrugNameForMatch(drugName);
  if (!normalized) return null;

  let best = null;
  let bestAliasLength = 0;
  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      const needle = normalizeDrugNameForMatch(alias);
      if (!needle) continue;
      if (normalized === needle || normalized.startsWith(`${needle} `) || normalized.includes(` ${needle} `)) {
        if (needle.length > bestAliasLength) {
          best = entry;
          bestAliasLength = needle.length;
        }
      }
    }
  }
  return best;
}
