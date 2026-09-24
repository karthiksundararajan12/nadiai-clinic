import "server-only";

/**
 * @fileoverview Pure prescription PDF generation (pdf-lib — no headless browser).
 *
 * Paper-pad layout: accent letterhead, two-row patient/vitals strip, ruled
 * body, serif Rx, and a signature footer on the last page only.
 *
 * Noto Sans is embedded (via @pdf-lib/fontkit) so Indian names render.
 * The Rx glyph uses the standard Times-Roman face (serif, built into PDF).
 *
 * Server-only: depends on node:fs. Never import from Client Components.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ageMonthsFromDateOfBirth } from "./pediatric-patient-context.js";
import {
  isObjectiveNotDocumented,
  parseVitalsFromObjective,
} from "../consultation-workspace/lib/vitals-objective.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

/** #1A56DB — doctor identity only. */
const ACCENT = rgb(0.1, 0.34, 0.86);
const TEXT = rgb(0.133, 0.133, 0.133);
const MUTED = rgb(0.39, 0.43, 0.47);
/** #CBD5E1 ruled lines. */
const RULE = rgb(0.796, 0.835, 0.882);
/** #94A3B8 page border. */
const BORDER = rgb(0.58, 0.639, 0.722);
const LINE_GAP = 26;
const BLANK = "________";
const VITAL_BLANK = "____";

const FONT_URLS = {
  "NotoSans-Regular.ttf": new URL(
    "../../booking/assets/fonts/NotoSans-Regular.ttf",
    import.meta.url,
  ),
  "NotoSans-Bold.ttf": new URL(
    "../../booking/assets/fonts/NotoSans-Bold.ttf",
    import.meta.url,
  ),
};

/** @type {Map<string, Buffer>} */
const fontBytesCache = new Map();

/** @param {"NotoSans-Regular.ttf"|"NotoSans-Bold.ttf"} filename */
function loadFontBytes(filename) {
  const cached = fontBytesCache.get(filename);
  if (cached) return cached;
  const url = FONT_URLS[filename];
  if (!url) throw new Error(`Unknown prescription PDF font: ${filename}`);
  try {
    const bytes = readFileSync(fileURLToPath(url));
    fontBytesCache.set(filename, bytes);
    return bytes;
  } catch (err) {
    throw new Error(
      `Prescription PDF font missing: ${filename} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** Re-export for callers that historically imported from this module. */
export { formatPrescriptionNumber } from "./prescription-number.js";

/** @param {Date} date */
function formatConsultationDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function clean(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} draft
 * @returns {Array<{ name: string; dose: string; frequency: string; duration: string; instructions: string; detail: string }>}
 */
function normalizeMedicines(draft) {
  const list = draft?.medications ?? draft?.medicines ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((med) => {
    const dose = clean(med?.dose ?? med?.dosage);
    const frequency = clean(med?.frequency);
    const duration = clean(med?.duration);
    const instructions = clean(med?.instructions);
    const detail = [dose, frequency, duration, instructions].filter(Boolean).join(" · ");
    return {
      name: clean(med?.name) || "Medicine",
      dose,
      frequency,
      duration,
      instructions,
      detail,
    };
  });
}

/**
 * @param {unknown} draft
 * @returns {string[]}
 */
function normalizeDiagnosis(draft) {
  const dx = draft?.diagnosis;
  if (Array.isArray(dx)) return dx.map((d) => clean(d)).filter(Boolean);
  if (typeof dx === "string" && dx.trim()) return [dx.trim()];
  return [];
}

/**
 * @param {unknown} draft
 * @param {string|null|undefined} complaints
 * @returns {string}
 */
function normalizeComplaints(draft, complaints) {
  const explicit = clean(complaints ?? draft?.complaints ?? draft?.chiefComplaint);
  if (explicit) return explicit;
  return "";
}

/**
 * @param {unknown} draft
 * @returns {string}
 */
function normalizeAdvice(draft) {
  const parts = [];
  const advice = draft?.advice;
  if (Array.isArray(advice)) parts.push(...advice.map((item) => clean(item)).filter(Boolean));
  else if (clean(advice)) parts.push(clean(advice));
  const doctorNotes = draft?.doctorNotes ?? draft?.doctor_notes ?? draft?.clinicalNotes;
  if (typeof doctorNotes === "string" && doctorNotes.trim()) parts.push(doctorNotes.trim());
  else if (Array.isArray(doctorNotes)) {
    parts.push(...doctorNotes.map((item) => clean(item)).filter(Boolean));
  }
  return parts.join("; ");
}

/**
 * @param {unknown} draft
 * @param {string|null|undefined} followUpDate
 * @returns {string}
 */
function normalizeFollowUp(draft, followUpDate) {
  const explicit = clean(followUpDate ?? draft?.followUpDate);
  if (explicit) return explicit;
  return clean(draft?.followUpInstructions);
}

/**
 * Completed years from DOB. Approximate DOB still prints that derived age
 * with no extra marker. Missing DOB stays blank — never invent an age.
 *
 * @param {string|Date|null|undefined} patientDob
 * @returns {string}
 */
function ageFromDob(patientDob) {
  if (patientDob == null || patientDob === "") return "";
  const raw = patientDob instanceof Date
    ? patientDob.toISOString().slice(0, 10)
    : String(patientDob);
  const months = ageMonthsFromDateOfBirth(raw);
  if (months == null) return "";
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years} yr`;
  return `${months} mo`;
}

/**
 * @param {string|null|undefined} gender
 * @returns {string}
 */
function formatSex(gender) {
  const g = clean(gender).toLowerCase();
  if (!g) return "";
  if (g === "m" || g === "male") return "M";
  if (g === "f" || g === "female") return "F";
  return clean(gender);
}

/**
 * Structured vitals from the SOAP Objective (hallucination-safe) plus an
 * optional patient-record weight. Objective "Not documented" yields empties.
 *
 * @param {Parameters<typeof buildPrescriptionDisplayFields>[0]} fields
 */
function resolveVitals(fields) {
  const objective = clean(fields.objective ?? fields.draft?.objective);
  if (isObjectiveNotDocumented(objective)) {
    return blankVitals();
  }
  const parsed = parseVitalsFromObjective(objective);
  const explicit = fields.vitals && typeof fields.vitals === "object" ? fields.vitals : {};

  const weight = clean(explicit.weightKg ?? explicit.weight) || clean(parsed.weight);
  const spo2 = clean(explicit.spo2 ?? explicit.spo2Percent) || clean(parsed.spo2);
  const heartRate = clean(explicit.heartRate ?? explicit.hr) || clean(parsed.hr);
  const bpExplicit = clean(explicit.bp);
  let bp = bpExplicit;
  if (!bp && (parsed.bpSys || parsed.bpDia)) {
    bp = parsed.bpSys && parsed.bpDia ? `${parsed.bpSys}/${parsed.bpDia}` : "";
  }
  const temperature = clean(explicit.temperature ?? explicit.temp) || clean(parsed.temp);

  return vitalDisplay({ weight, spo2, heartRate, bp, temperature });
}

function blankVitals() {
  return vitalDisplay({ weight: "", spo2: "", heartRate: "", bp: "", temperature: "" });
}

/**
 * @param {{ weight: string; spo2: string; heartRate: string; bp: string; temperature: string }} values
 */
function vitalDisplay(values) {
  const { weight, spo2, heartRate, bp, temperature } = values;
  return {
    weight: weight ? `Weight: ${weight} kg` : `Weight: ${VITAL_BLANK} kg`,
    spo2: spo2 ? `SpO2: ${spo2} %` : `SpO2: ${VITAL_BLANK} %`,
    heartRate: heartRate ? `Heart Rate: ${heartRate} bpm` : `Heart Rate: ${VITAL_BLANK} bpm`,
    bp: bp ? `BP: ${bp}` : "",
    temperature: temperature ? `Temp: ${temperature}` : "",
    weightValue: weight,
    spo2Value: spo2,
    heartRateValue: heartRate,
    bpValue: bp,
    temperatureValue: temperature,
  };
}

/**
 * Builds the display values used on the PDF (also unit-tested without
 * scraping PDF binary text).
 *
 * @param {{
 *   clinicName?: string|null;
 *   clinicAddress?: string|null;
 *   clinicPhone?: string|null;
 *   doctorName?: string|null;
 *   qualifications?: string|null;
 *   specialization?: string|null;
 *   registrationNumber?: string|null;
 *   signatureUrl?: string|null;
 *   patientName?: string|null;
 *   patientAge?: number|string|null;
 *   patientDob?: string|Date|null;
 *   dobIsApproximate?: boolean;
 *   patientGender?: string|null;
 *   consultationDate?: string|Date|null;
 *   prescriptionNumber: string;
 *   objective?: string|null;
 *   complaints?: string|null;
 *   followUpDate?: string|null;
 *   vitals?: {
 *     weightKg?: number|string|null;
 *     weight?: number|string|null;
 *     spo2?: number|string|null;
 *     heartRate?: number|string|null;
 *     hr?: number|string|null;
 *     bp?: string|null;
 *     temperature?: number|string|null;
 *     temp?: number|string|null;
 *   }|null;
 *   draft?: Record<string, unknown>;
 * }} fields
 */
export function buildPrescriptionDisplayFields(fields) {
  const consultationRaw = fields.consultationDate
    ? fields.consultationDate instanceof Date
      ? fields.consultationDate
      : new Date(fields.consultationDate)
    : new Date();

  const doctorName = clean(fields.doctorName);
  const qualifications = clean(fields.qualifications);
  const specialization = clean(fields.specialization);
  const credentialLine = [qualifications, specialization].filter(Boolean).join(" · ");
  const registrationNumber = clean(fields.registrationNumber);
  const registrationLine = registrationNumber
    ? `Reg. No: ${registrationNumber}`
    : `Reg. No: ${BLANK}`;

  const age = ageFromDob(fields.patientDob);
  const sex = formatSex(fields.patientGender);
  const ageSex = [age || VITAL_BLANK, sex].filter(Boolean).join(" / ");

  const vitals = resolveVitals(fields);
  const vitalRow = [vitals.weight, vitals.spo2, vitals.heartRate, vitals.bp, vitals.temperature]
    .filter(Boolean);

  const advice = normalizeAdvice(fields.draft);
  const followUp = normalizeFollowUp(fields.draft, fields.followUpDate);
  const complaints = normalizeComplaints(fields.draft, fields.complaints);
  const diagnosis = normalizeDiagnosis(fields.draft);

  const display = {
    doctorName,
    credentialLine,
    clinicName: clean(fields.clinicName),
    clinicAddress: clean(fields.clinicAddress),
    clinicPhone: clean(fields.clinicPhone),
    registrationNumber,
    registrationLine,
    signatureUrl: clean(fields.signatureUrl),
    patientName: clean(fields.patientName),
    ageSex,
    ageValue: age,
    sexValue: sex,
    consultationDateLabel: Number.isNaN(consultationRaw.getTime())
      ? ""
      : formatConsultationDate(consultationRaw),
    prescriptionNumber: clean(fields.prescriptionNumber),
    complaints,
    diagnosis,
    medicines: normalizeMedicines(fields.draft),
    vitalRow,
    vitals,
    advice,
    followUp,
    signatureName: doctorName,
    disclaimer: "Generated via Nadi AI · Valid only with doctor's signature",
  };

  display.padText = [
    display.doctorName,
    display.credentialLine,
    display.clinicName,
    display.clinicAddress,
    display.clinicPhone,
    display.registrationLine,
    `Name: ${display.patientName}`,
    `Age/Sex: ${display.ageSex}`,
    `Date: ${display.consultationDateLabel}`,
    `Rx No: ${display.prescriptionNumber}`,
    ...display.vitalRow,
    display.complaints ? `Complaints: ${display.complaints}` : "",
    display.diagnosis.length ? `Diagnosis: ${display.diagnosis.join("; ")}` : "",
    ...display.medicines.flatMap((med, index) => [`${index + 1}. ${med.name}`, med.detail]),
    display.advice ? `Advice: ${display.advice}` : "",
    display.followUp ? `Follow-up: ${display.followUp}` : "",
    display.signatureName,
    display.registrationLine,
    display.disclaimer,
    "Rx",
  ].filter(Boolean).join("\n");

  return display;
}

/**
 * @param {string} text
 * @param {import("pdf-lib").PDFFont} font
 * @param {number} size
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * @param {PDFDocument} pdf
 * @param {string|null|undefined} signatureUrl
 */
async function tryEmbedSignature(pdf, signatureUrl) {
  if (!signatureUrl) return null;
  try {
    const res = await fetch(signatureUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 8) return null;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isPng) return await pdf.embedPng(bytes);
    if (isJpg) return await pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {{ font: import("pdf-lib").PDFFont; fontBold: import("pdf-lib").PDFFont; display: ReturnType<typeof buildPrescriptionDisplayFields>; compact: boolean }} ctx
 * @returns {number} y under the letterhead rule
 */
function drawLetterhead(page, ctx) {
  const { font, fontBold, display, compact } = ctx;
  const right = PAGE_WIDTH - MARGIN;
  let y = PAGE_HEIGHT - MARGIN;
  const nameSize = compact ? 12 : 16;

  if (display.doctorName) {
    page.drawText(display.doctorName, { x: MARGIN, y: y - nameSize, size: nameSize, font: fontBold, color: ACCENT });
    y -= nameSize + 4;
  }
  if (!compact && display.credentialLine) {
    for (const line of wrapText(display.credentialLine, font, 9, right - MARGIN)) {
      page.drawText(line, { x: MARGIN, y: y - 9, size: 9, font, color: ACCENT });
      y -= 12;
    }
  } else if (compact && display.credentialLine) {
    page.drawText(display.credentialLine, {
      x: MARGIN, y: y - 8, size: 8, font, color: ACCENT, maxWidth: right - MARGIN,
    });
    y -= 11;
  }

  const clinicBits = compact
    ? [display.clinicName, display.clinicPhone, display.registrationLine].filter(Boolean)
    : [display.clinicName, display.clinicAddress, display.clinicPhone, display.registrationLine].filter(Boolean);

  if (compact) {
    const line = clinicBits.join("  ·  ");
    if (line) {
      page.drawText(line, { x: MARGIN, y: y - 8, size: 8, font, color: ACCENT, maxWidth: right - MARGIN });
      y -= 12;
    }
  } else {
    for (const bit of clinicBits) {
      for (const line of wrapText(bit, font, 9, right - MARGIN)) {
        page.drawText(line, { x: MARGIN, y: y - 9, size: 9, font, color: ACCENT });
        y -= 12;
      }
    }
  }

  y -= 4;
  page.drawRectangle({ x: MARGIN, y: y - 2, width: right - MARGIN, height: 2, color: ACCENT });
  return y - 10;
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {number} top
 * @param {import("pdf-lib").PDFFont} font
 * @param {import("pdf-lib").PDFFont} fontBold
 * @param {ReturnType<typeof buildPrescriptionDisplayFields>} display
 * @returns {number}
 */
function drawPatientStrip(page, top, font, fontBold, display) {
  const right = PAGE_WIDTH - MARGIN;
  const width = right - MARGIN;
  const rowH = 20;
  const height = rowH * 2;
  const bottom = top - height;

  page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width,
    height,
    borderColor: TEXT,
    borderWidth: 0.7,
  });
  page.drawLine({
    start: { x: MARGIN, y: bottom + rowH },
    end: { x: right, y: bottom + rowH },
    thickness: 0.4,
    color: BORDER,
  });

  const row1 = [
    `Name: ${display.patientName}`,
    `Age/Sex: ${display.ageSex}`,
    `Date: ${display.consultationDateLabel}`,
    `Rx No: ${display.prescriptionNumber}`,
  ];
  drawCells(page, font, fontBold, row1, MARGIN, bottom + rowH, width, rowH);
  drawCells(page, font, fontBold, display.vitalRow, MARGIN, bottom, width, rowH);
  return bottom - 8;
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {import("pdf-lib").PDFFont} font
 * @param {import("pdf-lib").PDFFont} fontBold
 * @param {string[]} cells
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function drawCells(page, font, fontBold, cells, x, y, width, height) {
  const n = Math.max(cells.length, 1);
  const col = width / n;
  for (let i = 0; i < cells.length; i += 1) {
    if (i > 0) {
      page.drawLine({
        start: { x: x + col * i, y },
        end: { x: x + col * i, y: y + height },
        thickness: 0.4,
        color: BORDER,
      });
    }
    const labelEnd = cells[i].indexOf(":");
    const label = labelEnd >= 0 ? cells[i].slice(0, labelEnd + 1) : "";
    const value = labelEnd >= 0 ? cells[i].slice(labelEnd + 1).trim() : cells[i];
    const textY = y + 6;
    page.drawText(label, { x: x + col * i + 4, y: textY, size: 7, font, color: MUTED });
    const labelW = font.widthOfTextAtSize(label, 7);
    if (value) {
      page.drawText(value, {
        x: x + col * i + 4 + labelW + 2,
        y: textY,
        size: 8,
        font: fontBold,
        color: TEXT,
        maxWidth: Math.max(8, col - labelW - 10),
      });
    }
  }
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {number} y
 * @param {import("pdf-lib").PDFFont} font
 * @param {import("pdf-lib").PDFFont} fontBold
 * @param {ReturnType<typeof buildPrescriptionDisplayFields>} display
 * @returns {number}
 */
function drawNotes(page, y, font, fontBold, display) {
  const width = PAGE_WIDTH - MARGIN * 2;
  const blocks = [];
  if (display.complaints) blocks.push(["Complaints", display.complaints]);
  if (display.diagnosis.length) blocks.push(["Diagnosis", display.diagnosis.join("; ")]);
  for (const [label, value] of blocks) {
    const text = `${label}: ${value}`;
    for (const line of wrapText(text, font, 9, width)) {
      page.drawText(line, { x: MARGIN, y: y - 9, size: 9, font: line.startsWith(label) ? fontBold : font, color: TEXT });
      y -= 12;
    }
    y -= 2;
  }
  return y;
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {number} bodyTop
 * @param {number} bodyBottom
 */
function drawRules(page, bodyTop, bodyBottom) {
  for (let y = bodyTop; y >= bodyBottom; y -= LINE_GAP) {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: RULE,
    });
  }
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {import("pdf-lib").PDFFont} rxFont
 */
function drawWatermark(page, rxFont) {
  const size = 92;
  const text = "Rx";
  const width = rxFont.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - width) / 2,
    y: PAGE_HEIGHT / 2 - 20,
    size,
    font: rxFont,
    color: ACCENT,
    opacity: 0.05,
  });
}

/**
 * @param {import("pdf-lib").PDFPage} page
 */
function drawPageBorder(page) {
  const inset = 14;
  page.drawRectangle({
    x: inset,
    y: inset,
    width: PAGE_WIDTH - inset * 2,
    height: PAGE_HEIGHT - inset * 2,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
}

/**
 * @param {{
 *   medicines: ReturnType<typeof normalizeMedicines>;
 *   font: import("pdf-lib").PDFFont;
 *   fontBold: import("pdf-lib").PDFFont;
 *   textWidth: number;
 * }} args
 */
function medicineLineCount(args) {
  const { medicines, font, fontBold, textWidth } = args;
  return medicines.map((med) => {
    const nameLines = Math.max(1, wrapText(med.name, fontBold, 10, textWidth).length);
    const detailLines = med.detail ? wrapText(med.detail, font, 8, textWidth).length : 1;
    return nameLines + detailLines;
  });
}

/**
 * @param {number} lineCount
 * @param {boolean} compact
 * @param {boolean} withFooter
 * @param {number} notesHeight
 */
function lineCapacity(lineCount, compact, withFooter, notesHeight) {
  void lineCount;
  const header = compact ? 86 : 132;
  const patient = 56;
  const footer = withFooter ? 156 : 36;
  const height = PAGE_HEIGHT - MARGIN - header - patient - notesHeight - footer - MARGIN;
  return Math.max(4, Math.floor(height / LINE_GAP));
}

/**
 * @param {number[]} costs
 * @param {boolean} hasNotes
 */
function paginate(costs, hasNotes) {
  /** @type {Array<{ start: number; end: number; compact: boolean; last: boolean }>} */
  const pages = [];
  let index = 0;
  let first = true;
  while (index < costs.length) {
    const notes = first && hasNotes ? 28 : 0;
    const withFooter = lineCapacity(0, !first, true, notes);
    const withoutFooter = lineCapacity(0, !first, false, notes);
    let used = 0;
    let end = index;
    const remainingCost = costs.slice(index).reduce((sum, n) => sum + n, 0);
    const lastPage = remainingCost <= withFooter;
    const budget = lastPage ? withFooter : withoutFooter;
    while (end < costs.length && used + costs[end] <= budget) {
      used += costs[end];
      end += 1;
    }
    if (end === index) {
      end = index + 1;
    }
    if (!lastPage && end >= costs.length) {
      end = Math.max(index + 1, costs.length - 1);
    }
    const isLast = end >= costs.length;
    pages.push({ start: index, end, compact: !first, last: isLast });
    index = end;
    first = false;
    if (pages.length > 20) break;
  }
  if (pages.length === 0) {
    pages.push({ start: 0, end: 0, compact: false, last: true });
  }
  return pages;
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {{
 *   font: import("pdf-lib").PDFFont;
 *   fontBold: import("pdf-lib").PDFFont;
 *   rxFont: import("pdf-lib").PDFFont;
 *   display: ReturnType<typeof buildPrescriptionDisplayFields>;
 *   medicines: ReturnType<typeof normalizeMedicines>;
 *   startIndex: number;
 *   bodyTop: number;
 *   bodyBottom: number;
 * }} ctx
 */
function drawMedicineBlock(page, ctx) {
  const { font, fontBold, rxFont, medicines, startIndex, bodyTop, bodyBottom } = ctx;
  const textX = MARGIN + 36;
  const textWidth = PAGE_WIDTH - MARGIN - textX;
  page.drawText("Rx", {
    x: MARGIN,
    y: bodyTop - 22,
    size: 28,
    font: rxFont,
    color: TEXT,
  });

  let y = bodyTop;
  for (let i = 0; i < medicines.length; i += 1) {
    const med = medicines[i];
    const nameLines = wrapText(`${startIndex + i + 1}. ${med.name}`, fontBold, 10, textWidth);
    const detailLines = med.detail ? wrapText(med.detail, font, 8, textWidth) : [];
    for (const line of nameLines) {
      y -= LINE_GAP;
      if (y < bodyBottom) return;
      page.drawText(line, { x: textX, y: y + 4, size: 10, font: fontBold, color: TEXT });
    }
    const grey = detailLines.length ? detailLines : [""];
    for (const line of grey) {
      y -= LINE_GAP;
      if (y < bodyBottom) return;
      if (line) page.drawText(line, { x: textX, y: y + 4, size: 8, font, color: MUTED });
    }
  }
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {import("pdf-lib").PDFFont} font
 * @param {import("pdf-lib").PDFFont} fontBold
 * @param {ReturnType<typeof buildPrescriptionDisplayFields>} display
 * @param {import("pdf-lib").PDFImage|null} signature
 */
function drawFooter(page, font, fontBold, display, signature) {
  const right = PAGE_WIDTH - MARGIN;
  let y = 148;
  const width = right - MARGIN;

  if (display.advice) {
    for (const line of wrapText(`Advice: ${display.advice}`, font, 9, width).slice(0, 2)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT });
      y -= 12;
    }
  }
  if (display.followUp) {
    for (const line of wrapText(`Follow-up: ${display.followUp}`, font, 9, width).slice(0, 2)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT });
      y -= 12;
    }
  }

  const lineY = 78;
  if (signature) {
    const maxW = 120;
    const maxH = 36;
    const scale = Math.min(maxW / signature.width, maxH / signature.height, 1);
    const w = signature.width * scale;
    const h = signature.height * scale;
    page.drawImage(signature, { x: right - w, y: lineY + 6, width: w, height: h });
  }

  page.drawLine({
    start: { x: right - 160, y: lineY },
    end: { x: right, y: lineY },
    thickness: 0.6,
    color: TEXT,
  });

  const sig = display.signatureName || "";
  if (sig) {
    page.drawText(sig, {
      x: right - fontBold.widthOfTextAtSize(sig, 9),
      y: lineY - 14,
      size: 9,
      font: fontBold,
      color: ACCENT,
    });
  }
  const reg = display.registrationLine;
  page.drawText(reg, {
    x: right - font.widthOfTextAtSize(reg, 8),
    y: lineY - 26,
    size: 8,
    font,
    color: ACCENT,
  });

  page.drawText(display.disclaimer, {
    x: MARGIN,
    y: 36,
    size: 7,
    font,
    color: MUTED,
  });
}

/**
 * Generates a prescription PDF and returns its bytes.
 *
 * @param {Parameters<typeof buildPrescriptionDisplayFields>[0]} fields
 * @returns {Promise<Uint8Array>}
 */
export async function generatePrescriptionPdf(fields) {
  const display = buildPrescriptionDisplayFields(fields);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(loadFontBytes("NotoSans-Regular.ttf"));
  const fontBold = await pdf.embedFont(loadFontBytes("NotoSans-Bold.ttf"));
  const rxFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const signature = await tryEmbedSignature(pdf, display.signatureUrl);

  const textWidth = PAGE_WIDTH - MARGIN - (MARGIN + 36);
  const costs = medicineLineCount({
    medicines: display.medicines,
    font,
    fontBold,
    textWidth,
  });
  const hasNotes = Boolean(display.complaints || display.diagnosis.length);
  const slices = paginate(costs, hasNotes);
  const total = slices.length;

  for (const slice of slices) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageBorder(page);
    drawWatermark(page, rxFont);
    let y = drawLetterhead(page, { font, fontBold, display, compact: slice.compact });
    y = drawPatientStrip(page, y, font, fontBold, display);
    if (!slice.compact) y = drawNotes(page, y, font, fontBold, display);

    const bodyBottom = slice.last ? 168 : 48;
    const bodyTop = y - 4;
    drawRules(page, bodyTop, bodyBottom);
    drawMedicineBlock(page, {
      font,
      fontBold,
      rxFont,
      display,
      medicines: display.medicines.slice(slice.start, slice.end),
      startIndex: slice.start,
      bodyTop,
      bodyBottom,
    });

    if (slice.last) drawFooter(page, font, fontBold, display, signature);

    const label = `Page ${slices.indexOf(slice) + 1} of ${total}`;
    page.drawText(label, {
      x: (PAGE_WIDTH - font.widthOfTextAtSize(label, 8)) / 2,
      y: 22,
      size: 8,
      font,
      color: MUTED,
    });
  }

  return pdf.save();
}
