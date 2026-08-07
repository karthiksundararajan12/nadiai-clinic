/**
 * @fileoverview Pure prescription PDF generation (pdf-lib — no headless browser).
 *
 * Builds a single-page prescription with a professional letterhead layout:
 * clinic header, patient block, Rx medication table, diagnosis / clinical notes,
 * and doctor signature footer.
 *
 * Noto Sans is embedded (via @pdf-lib/fontkit) for consistent Unicode rendering.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 45;

/** Single restrained accent for header band / rules (slate-teal). */
const ACCENT = rgb(0.14, 0.33, 0.4);
const ACCENT_LIGHT = rgb(0.9, 0.94, 0.95);
const TEXT = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.4, 0.43, 0.46);
const LINE = rgb(0.78, 0.8, 0.82);
const WHITE = rgb(1, 1, 1);

const FONTS_DIR_CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), "../../booking/assets/fonts"),
  join(process.cwd(), "features/booking/assets/fonts"),
];

/** @type {Map<string, Buffer>} */
const fontBytesCache = new Map();

/** @param {"NotoSans-Regular.ttf"|"NotoSans-Bold.ttf"} filename */
function loadFontBytes(filename) {
  const cached = fontBytesCache.get(filename);
  if (cached) return cached;
  let lastErr = null;
  for (const dir of FONTS_DIR_CANDIDATES) {
    try {
      const bytes = readFileSync(join(dir, filename));
      fontBytesCache.set(filename, bytes);
      return bytes;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Prescription PDF font missing: ${filename} (${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

/**
 * Formats a per-clinic sequential sequence into a stable prescription number.
 * @param {number|bigint|string} seq
 * @returns {string}
 */
export function formatPrescriptionNumber(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`prescription sequence must be a positive integer, got ${seq}`);
  }
  return `RX-${String(Math.trunc(n)).padStart(6, "0")}`;
}

/** @param {Date} date */
function formatDisplayDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * @param {string|Date|null|undefined} raw
 * @returns {string}
 */
function formatOptionalDate(raw) {
  if (!raw) return "NA";
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? "NA" : formatDisplayDate(date);
}

/**
 * @param {string|number|null|undefined} age
 * @param {string|Date|null|undefined} dob
 * @returns {string}
 */
function formatAgeDob(age, dob) {
  const parts = [];
  if (age != null && String(age).trim() !== "") {
    const ageStr = String(age).trim();
    parts.push(/\d/.test(ageStr) && !/year/i.test(ageStr) ? `${ageStr} years` : ageStr);
  }
  const dobLabel = formatOptionalDate(dob);
  if (dobLabel !== "NA") {
    parts.push(`DOB: ${dobLabel}`);
  }
  return parts.length ? parts.join(" · ") : "NA";
}

/**
 * @param {Record<string, unknown>|null|undefined} draft
 * @returns {Array<{ name: string; dose: string; frequency: string; duration: string; instructions: string }>}
 */
function normalizeMedicines(draft) {
  const raw =
    (Array.isArray(draft?.medications) ? draft.medications : null) ??
    (Array.isArray(draft?.medicines) ? draft.medicines : null) ??
    [];

  return raw.map((med) => {
    const item = /** @type {Record<string, unknown>} */ (med ?? {});
    const doseRaw = item.dosage ?? item.dose;
    return {
      name: String(item.name ?? "").trim() || "NA",
      dose: doseRaw != null ? String(doseRaw).trim() || "NA" : "NA",
      frequency: String(item.frequency ?? "").trim() || "NA",
      duration: String(item.duration ?? "").trim() || "NA",
      instructions: String(item.instructions ?? "").trim(),
    };
  });
}

/**
 * @param {Record<string, unknown>|null|undefined} draft
 * @returns {string[]}
 */
function buildClinicalNotes(draft) {
  const notes = [];

  const advice = Array.isArray(draft?.advice) ? draft.advice : [];
  for (const item of advice) {
    const text = String(item).trim();
    if (text) notes.push(text);
  }

  const followUpInstructions =
    typeof draft?.followUpInstructions === "string" ? draft.followUpInstructions.trim() : "";
  if (followUpInstructions) {
    notes.push(followUpInstructions);
  } else {
    const followUpDays = Number(draft?.followUpDays);
    if (Number.isFinite(followUpDays) && followUpDays > 0) {
      notes.push(`Follow up in ${followUpDays} days`);
    }
  }

  const warnings = Array.isArray(draft?.warnings) ? draft.warnings : [];
  for (const item of warnings) {
    const text = String(item).trim();
    if (text) notes.push(`Warning: ${text}`);
  }

  const doctorNotes =
    typeof draft?.doctorNotes === "string" ? draft.doctorNotes.trim() : "";
  if (doctorNotes) notes.push(doctorNotes);

  return notes;
}

/**
 * Builds the display values used on the PDF (also unit-tested for field
 * correctness without scraping PDF binary text).
 *
 * @param {{
 *   clinicName: string;
 *   clinicAddress?: string|null;
 *   clinicPhone?: string|null;
 *   doctorName: string;
 *   specialization?: string|null;
 *   registrationNumber?: string|null;
 *   patientName: string;
 *   patientAge?: string|number|null;
 *   patientDob?: string|Date|null;
 *   consultationDate?: string|Date|null;
 *   prescriptionNumber: string;
 *   draft?: Record<string, unknown>|null;
 * }} fields
 */
export function buildPrescriptionDisplayFields(fields) {
  const draft = fields.draft ?? {};
  const doctorName = fields.doctorName?.trim() || "NA";
  const specialization = fields.specialization?.trim() || "";
  const registrationNumber = fields.registrationNumber?.trim() || "NA";

  const diagnosis = Array.isArray(draft.diagnosis)
    ? draft.diagnosis.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    title: "PRESCRIPTION",
    prescriptionNumber: fields.prescriptionNumber,
    consultationDateLabel: formatOptionalDate(fields.consultationDate),
    clinicName: fields.clinicName?.trim() || "Clinic",
    clinicAddress: fields.clinicAddress?.trim() || "NA",
    clinicPhone: fields.clinicPhone?.trim() || "NA",
    doctorName,
    doctorLine:
      specialization && doctorName !== "NA"
        ? `${doctorName} · ${specialization}`
        : doctorName,
    specialization: specialization || "NA",
    registrationNumber,
    patientName: fields.patientName?.trim() || "NA",
    patientAge:
      fields.patientAge != null && String(fields.patientAge).trim() !== ""
        ? String(fields.patientAge).trim()
        : "NA",
    patientDob: formatOptionalDate(fields.patientDob),
    ageDob: formatAgeDob(fields.patientAge, fields.patientDob),
    medicines: normalizeMedicines(draft),
    diagnosis,
    clinicalNotes: buildClinicalNotes(draft),
    signatureLabel: doctorName === "NA" ? "Doctor's Signature" : `Dr. ${doctorName}`,
    generatedVia: "Generated via Nadi AI",
  };
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
  if (words.length === 0) return [""];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * @param {import("pdf-lib").PDFPage} page
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {string} title
 * @param {string[]} items
 * @param {import("pdf-lib").PDFFont} font
 * @param {import("pdf-lib").PDFFont} fontBold
 * @returns {number}
 */
function drawBulletSection(page, x, y, width, title, items, font, fontBold) {
  if (!items.length) return y;

  page.drawText(title, {
    x,
    y,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  y -= 16;

  for (const item of items) {
    const lines = wrapText(item, font, 9, width - 12);
    for (let i = 0; i < lines.length; i += 1) {
      page.drawText(i === 0 ? `• ${lines[i]}` : `  ${lines[i]}`, {
        x,
        y,
        size: 9,
        font,
        color: TEXT,
      });
      y -= 12;
    }
    y -= 4;
  }

  return y - 6;
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
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(loadFontBytes("NotoSans-Regular.ttf"));
  const fontBold = await pdf.embedFont(loadFontBytes("NotoSans-Bold.ttf"));

  const contentRight = PAGE_WIDTH - MARGIN;
  const contentWidth = contentRight - MARGIN;
  let y = PAGE_HEIGHT - MARGIN;

  // ── Header band ──────────────────────────────────────────────
  const headerTop = y;
  page.drawText(display.clinicName, {
    x: MARGIN,
    y: headerTop - 14,
    size: 18,
    font: fontBold,
    color: ACCENT,
    maxWidth: 280,
  });

  let leftY = headerTop - 32;
  const leftMetaSize = 9;

  page.drawText(display.doctorLine, {
    x: MARGIN,
    y: leftY,
    size: leftMetaSize,
    font: fontBold,
    color: TEXT,
    maxWidth: 280,
  });
  leftY -= 12;

  if (display.registrationNumber && display.registrationNumber !== "NA") {
    page.drawText(`Reg. No.: ${display.registrationNumber}`, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }

  for (const line of wrapText(display.clinicAddress, font, leftMetaSize, 260)) {
    page.drawText(line, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }

  if (display.clinicPhone && display.clinicPhone !== "NA") {
    page.drawText(display.clinicPhone, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }

  const titleLabel = display.title;
  const titleLabelSize = 20;
  const titleLabelWidth = fontBold.widthOfTextAtSize(titleLabel, titleLabelSize);
  page.drawText(titleLabel, {
    x: contentRight - titleLabelWidth,
    y: headerTop - 14,
    size: titleLabelSize,
    font: fontBold,
    color: ACCENT,
  });

  const rxNum = display.prescriptionNumber;
  const rxNumWidth = font.widthOfTextAtSize(rxNum, 10);
  page.drawText(rxNum, {
    x: contentRight - rxNumWidth,
    y: headerTop - 32,
    size: 10,
    font,
    color: TEXT,
  });

  y = Math.min(leftY, headerTop - 46) - 8;

  page.drawRectangle({
    x: MARGIN,
    y: y - 3,
    width: contentWidth,
    height: 3,
    color: ACCENT,
  });
  y -= 28;

  // ── Patient block ────────────────────────────────────────────
  page.drawText("Patient", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: contentRight, y },
    thickness: 0.6,
    color: LINE,
  });
  y -= 16;

  /** @param {number} startY @param {Array<[string, string]>} rows */
  const drawLabeledBlock = (startY, rows) => {
    let cursor = startY;
    for (const [label, value] of rows) {
      page.drawText(label, {
        x: MARGIN,
        y: cursor,
        size: 8,
        font,
        color: MUTED,
      });
      cursor -= 12;
      const valueLines = wrapText(value, fontBold, 10, contentWidth);
      for (const line of valueLines) {
        page.drawText(line, {
          x: MARGIN,
          y: cursor,
          size: 10,
          font: fontBold,
          color: TEXT,
        });
        cursor -= 13;
      }
      cursor -= 6;
    }
    return cursor;
  };

  y = drawLabeledBlock(y, [
    ["Name", display.patientName],
    ["Age / DOB", display.ageDob],
    ["Date of Consultation", display.consultationDateLabel],
  ]);
  y -= 8;

  // ── Rx table ─────────────────────────────────────────────────
  const tableHeaderH = 22;
  const rowFontSize = 8;
  const rowLineH = 11;
  const rowPadV = 8;

  const colNumW = 22;
  const colMedW = 108;
  const colDoseW = 56;
  const colFreqW = 66;
  const colDurW = 56;
  const colInstW = contentWidth - colNumW - colMedW - colDoseW - colFreqW - colDurW;

  const colNumX = MARGIN + 4;
  const colMedX = MARGIN + colNumW;
  const colDoseX = colMedX + colMedW;
  const colFreqX = colDoseX + colDoseW;
  const colDurX = colFreqX + colFreqW;
  const colInstX = colDurX + colDurW;

  page.drawRectangle({
    x: MARGIN,
    y: y - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: ACCENT,
  });

  const headers = [
    ["#", colNumX],
    ["Medicine", colMedX + 2],
    ["Dose", colDoseX + 2],
    ["Frequency", colFreqX + 2],
    ["Duration", colDurX + 2],
    ["Instructions", colInstX + 2],
  ];
  for (const [label, x] of headers) {
    page.drawText(label, {
      x,
      y: y - 15,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
  }
  y -= tableHeaderH;

  const medicines =
    display.medicines.length > 0
      ? display.medicines
      : [{ name: "—", dose: "—", frequency: "—", duration: "—", instructions: "" }];

  for (let i = 0; i < medicines.length; i += 1) {
    const med = medicines[i];
    const medLines = wrapText(med.name, font, rowFontSize, colMedW - 6);
    const doseLines = wrapText(med.dose, font, rowFontSize, colDoseW - 6);
    const freqLines = wrapText(med.frequency, font, rowFontSize, colFreqW - 6);
    const durLines = wrapText(med.duration, font, rowFontSize, colDurW - 6);
    const instLines = med.instructions
      ? wrapText(med.instructions, font, rowFontSize, colInstW - 6)
      : [""];

    const lineCount = Math.max(
      medLines.length,
      doseLines.length,
      freqLines.length,
      durLines.length,
      instLines.length,
      1,
    );
    const rowH = rowPadV * 2 + lineCount * rowLineH;

    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: contentWidth,
      height: rowH,
      borderColor: LINE,
      borderWidth: 0.8,
      color: i % 2 === 0 ? WHITE : ACCENT_LIGHT,
    });

    const textY = y - rowPadV - rowFontSize;
    page.drawText(String(i + 1), {
      x: colNumX,
      y: textY,
      size: rowFontSize,
      font,
      color: TEXT,
    });

    const drawColLines = (lines, x, maxW) => {
      let cursor = textY;
      for (const line of lines) {
        page.drawText(line, {
          x: x + 2,
          y: cursor,
          size: rowFontSize,
          font,
          color: TEXT,
          maxWidth: maxW - 4,
        });
        cursor -= rowLineH;
      }
    };

    drawColLines(medLines, colMedX, colMedW);
    drawColLines(doseLines, colDoseX, colDoseW);
    drawColLines(freqLines, colFreqX, colFreqW);
    drawColLines(durLines, colDurX, colDurW);
    drawColLines(instLines, colInstX, colInstW);

    y -= rowH;
  }

  y -= 18;

  // ── Diagnosis / Clinical notes ───────────────────────────────
  y = drawBulletSection(
    page,
    MARGIN,
    y,
    contentWidth,
    "Diagnosis",
    display.diagnosis,
    font,
    fontBold,
  );
  y = drawBulletSection(
    page,
    MARGIN,
    y,
    contentWidth,
    "Clinical Notes",
    display.clinicalNotes,
    font,
    fontBold,
  );

  // ── Footer ───────────────────────────────────────────────────
  const footerTop = Math.max(y, MARGIN + 72);
  y = footerTop;

  page.drawLine({
    start: { x: contentRight - 180, y },
    end: { x: contentRight, y },
    thickness: 0.8,
    color: LINE,
  });
  y -= 14;

  page.drawText(display.signatureLabel, {
    x: contentRight - 180,
    y,
    size: 10,
    font: fontBold,
    color: TEXT,
  });
  y -= 14;

  if (display.registrationNumber && display.registrationNumber !== "NA") {
    const regLine = `Reg. No.: ${display.registrationNumber}`;
    page.drawText(regLine, {
      x: contentRight - 180,
      y,
      size: 9,
      font,
      color: MUTED,
    });
    y -= 14;
  }

  y -= 8;
  page.drawText(display.generatedVia, {
    x: MARGIN,
    y: Math.max(y, MARGIN),
    size: 8,
    font,
    color: MUTED,
  });

  return pdf.save();
}
