/**
 * @fileoverview Pure prescription PDF generation (pdf-lib — no headless browser).
 *
 * Builds a letterhead-style Rx PDF: clinic/doctor header, patient block,
 * numbered medicine table, optional diagnosis/clinical notes, and signature
 * footer. Mirrors the invoice PDF layout conventions without sharing code.
 *
 * Noto Sans is embedded (via @pdf-lib/fontkit) so Indian text / ₹ glyphs
 * render — Helvetica WinAnsi cannot encode them.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 45;

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
 * Formats a per-clinic sequential sequence into a stable Rx number.
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
function formatConsultationDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * @param {string|Date|null|undefined} raw
 * @returns {string}
 */
function formatDob(raw) {
  if (raw == null || raw === "") return "NA";
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return "NA";
  return formatConsultationDate(date);
}

/**
 * @param {unknown} draft
 * @returns {Array<{
 *   name: string;
 *   dose: string;
 *   frequency: string;
 *   duration: string;
 *   instructions: string;
 * }>}
 */
function normalizeMedicines(draft) {
  const list = draft?.medications ?? draft?.medicines ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((med) => ({
    name: String(med?.name ?? "").trim() || "NA",
    dose: String(med?.dose ?? med?.dosage ?? "").trim() || "NA",
    frequency: String(med?.frequency ?? "").trim() || "NA",
    duration: String(med?.duration ?? "").trim() || "NA",
    instructions: String(med?.instructions ?? "").trim() || "",
  }));
}

/**
 * @param {unknown} draft
 * @returns {string[]}
 */
function normalizeDiagnosis(draft) {
  const dx = draft?.diagnosis;
  if (Array.isArray(dx)) {
    return dx.map((d) => String(d ?? "").trim()).filter(Boolean);
  }
  if (typeof dx === "string" && dx.trim()) return [dx.trim()];
  return [];
}

/**
 * Clinical / doctor notes from advice, follow-up, warnings, and explicit notes.
 * @param {unknown} draft
 * @returns {string[]}
 */
function normalizeClinicalNotes(draft) {
  const notes = [];
  const advice = Array.isArray(draft?.advice) ? draft.advice : [];
  for (const item of advice) {
    const line = String(item ?? "").trim();
    if (line) notes.push(line);
  }
  const followUp = String(draft?.followUpInstructions ?? "").trim();
  if (followUp) notes.push(followUp);
  else if (draft?.followUpDays != null && Number.isFinite(Number(draft.followUpDays))) {
    notes.push(`Follow up in ${Number(draft.followUpDays)} days`);
  }
  const warnings = Array.isArray(draft?.warnings) ? draft.warnings : [];
  for (const item of warnings) {
    const line = String(item ?? "").trim();
    if (line) notes.push(`Warning: ${line}`);
  }
  const doctorNotes = draft?.doctorNotes ?? draft?.doctor_notes ?? draft?.clinicalNotes;
  if (typeof doctorNotes === "string" && doctorNotes.trim()) {
    notes.push(doctorNotes.trim());
  } else if (Array.isArray(doctorNotes)) {
    for (const item of doctorNotes) {
      const line = String(item ?? "").trim();
      if (line) notes.push(line);
    }
  }
  return notes;
}

/**
 * Builds the display values used on the PDF (also unit-tested without
 * scraping PDF binary text).
 *
 * @param {{
 *   clinicName: string;
 *   clinicAddress?: string|null;
 *   clinicPhone?: string|null;
 *   doctorName: string;
 *   specialization?: string|null;
 *   registrationNumber?: string|null;
 *   patientName: string;
 *   patientAge?: number|string|null;
 *   patientDob?: string|Date|null;
 *   consultationDate?: string|Date|null;
 *   prescriptionNumber: string;
 *   draft: Record<string, unknown>;
 * }} fields
 */
export function buildPrescriptionDisplayFields(fields) {
  const consultationRaw = fields.consultationDate
    ? fields.consultationDate instanceof Date
      ? fields.consultationDate
      : new Date(fields.consultationDate)
    : new Date();

  const ageRaw = fields.patientAge;
  const ageLabel =
    ageRaw == null || ageRaw === ""
      ? null
      : `${Number.isFinite(Number(ageRaw)) ? Math.trunc(Number(ageRaw)) : String(ageRaw)} yr`;

  const dobLabel = formatDob(fields.patientDob);
  const ageDobParts = [];
  if (ageLabel) ageDobParts.push(ageLabel);
  if (dobLabel !== "NA") ageDobParts.push(`DOB ${dobLabel}`);
  const ageDob = ageDobParts.length > 0 ? ageDobParts.join(" · ") : "NA";

  const registrationNumber =
    typeof fields.registrationNumber === "string" && fields.registrationNumber.trim()
      ? fields.registrationNumber.trim()
      : "NA";

  const doctorName = fields.doctorName?.trim() || "NA";
  const specialization = fields.specialization?.trim() || "NA";

  return {
    title: "PRESCRIPTION",
    prescriptionNumber: fields.prescriptionNumber,
    clinicName: fields.clinicName?.trim() || "Clinic",
    clinicAddress: fields.clinicAddress?.trim() || "NA",
    clinicPhone: fields.clinicPhone?.trim() || "NA",
    doctorName,
    specialization,
    registrationNumber,
    patientName: fields.patientName?.trim() || "NA",
    ageDob,
    consultationDateLabel: Number.isNaN(consultationRaw.getTime())
      ? "NA"
      : formatConsultationDate(consultationRaw),
    medicines: normalizeMedicines(fields.draft),
    diagnosis: normalizeDiagnosis(fields.draft),
    clinicalNotes: normalizeClinicalNotes(fields.draft),
    signatureLabel: doctorName === "NA" ? "Doctor's signature" : `Dr. ${doctorName}`,
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

  // ── Header ─────────────────────────────────────────────────
  const headerTop = y;
  page.drawText(display.clinicName, {
    x: MARGIN,
    y: headerTop - 14,
    size: 18,
    font: fontBold,
    color: ACCENT,
    maxWidth: 320,
  });

  let leftY = headerTop - 32;
  const leftMetaSize = 9;
  const doctorLine =
    display.specialization !== "NA"
      ? `${display.doctorName} · ${display.specialization}`
      : display.doctorName;
  for (const line of wrapText(doctorLine, font, leftMetaSize, 300)) {
    page.drawText(line, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: TEXT,
    });
    leftY -= 12;
  }
  if (display.registrationNumber !== "NA") {
    page.drawText(`Reg. No. ${display.registrationNumber}`, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }
  for (const line of wrapText(display.clinicAddress, font, leftMetaSize, 300)) {
    page.drawText(line, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }
  if (display.clinicPhone !== "NA") {
    page.drawText(display.clinicPhone, {
      x: MARGIN,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }

  const rxLabel = display.title;
  const rxLabelSize = 16;
  const rxLabelWidth = fontBold.widthOfTextAtSize(rxLabel, rxLabelSize);
  page.drawText(rxLabel, {
    x: contentRight - rxLabelWidth,
    y: headerTop - 14,
    size: rxLabelSize,
    font: fontBold,
    color: ACCENT,
  });

  const rxNumWidth = font.widthOfTextAtSize(display.prescriptionNumber, 10);
  page.drawText(display.prescriptionNumber, {
    x: contentRight - rxNumWidth,
    y: headerTop - 32,
    size: 10,
    font,
    color: TEXT,
  });

  y = Math.min(leftY, headerTop - 58) - 8;

  page.drawRectangle({
    x: MARGIN,
    y: y - 3,
    width: contentWidth,
    height: 3,
    color: ACCENT,
  });
  y -= 28;

  // ── Patient block ──────────────────────────────────────────
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

  const patientRows = [
    ["Name", display.patientName],
    ["Age / DOB", display.ageDob],
    ["Date of consultation", display.consultationDateLabel],
  ];
  for (const [label, value] of patientRows) {
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: MUTED,
    });
    page.drawText(value, {
      x: MARGIN + 120,
      y,
      size: 10,
      font: fontBold,
      color: TEXT,
      maxWidth: contentWidth - 130,
    });
    y -= 16;
  }
  y -= 10;

  // ── Rx medicine table ──────────────────────────────────────
  page.drawText("Rx", {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
    color: ACCENT,
  });
  y -= 18;

  const colPad = 6;
  const cols = [
    { key: "idx", label: "#", width: 22 },
    { key: "name", label: "Medicine", width: 120 },
    { key: "dose", label: "Dose", width: 70 },
    { key: "frequency", label: "Frequency", width: 80 },
    { key: "duration", label: "Duration", width: 70 },
    { key: "instructions", label: "Instructions", width: contentWidth - 22 - 120 - 70 - 80 - 70 },
  ];

  const tableHeaderH = 20;
  page.drawRectangle({
    x: MARGIN,
    y: y - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: ACCENT,
  });

  let colX = MARGIN + colPad;
  for (const col of cols) {
    page.drawText(col.label, {
      x: colX,
      y: y - 14,
      size: 8,
      font: fontBold,
      color: WHITE,
    });
    colX += col.width;
  }
  y -= tableHeaderH;

  if (display.medicines.length === 0) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 24,
      width: contentWidth,
      height: 24,
      borderColor: LINE,
      borderWidth: 0.6,
      color: WHITE,
    });
    page.drawText("No medicines listed", {
      x: MARGIN + colPad,
      y: y - 16,
      size: 9,
      font,
      color: MUTED,
    });
    y -= 24;
  } else {
    display.medicines.forEach((med, index) => {
      const cellValues = {
        idx: String(index + 1),
        name: med.name,
        dose: med.dose,
        frequency: med.frequency,
        duration: med.duration,
        instructions: med.instructions || "—",
      };

      const wrappedByCol = cols.map((col) =>
        wrapText(cellValues[col.key], font, 8, col.width - colPad * 2),
      );
      const maxLines = Math.max(...wrappedByCol.map((lines) => lines.length), 1);
      const rowH = Math.max(22, maxLines * 11 + 10);

      const rowBg = index % 2 === 0 ? WHITE : ACCENT_LIGHT;
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: contentWidth,
        height: rowH,
        borderColor: LINE,
        borderWidth: 0.5,
        color: rowBg,
      });

      let x = MARGIN + colPad;
      cols.forEach((col, colIndex) => {
        const lines = wrappedByCol[colIndex];
        let textY = y - 14;
        for (const line of lines) {
          page.drawText(line, {
            x,
            y: textY,
            size: 8,
            font: col.key === "name" ? fontBold : font,
            color: TEXT,
          });
          textY -= 11;
        }
        x += col.width;
      });
      y -= rowH;
    });
  }

  y -= 20;

  // ── Diagnosis / clinical notes ─────────────────────────────
  if (display.diagnosis.length > 0 || display.clinicalNotes.length > 0) {
    if (display.diagnosis.length > 0) {
      page.drawText("Diagnosis", {
        x: MARGIN,
        y,
        size: 10,
        font: fontBold,
        color: ACCENT,
      });
      y -= 14;
      for (const item of display.diagnosis) {
        for (const line of wrapText(`• ${item}`, font, 9, contentWidth)) {
          page.drawText(line, {
            x: MARGIN,
            y,
            size: 9,
            font,
            color: TEXT,
          });
          y -= 12;
        }
      }
      y -= 8;
    }

    if (display.clinicalNotes.length > 0) {
      page.drawText("Clinical notes", {
        x: MARGIN,
        y,
        size: 10,
        font: fontBold,
        color: ACCENT,
      });
      y -= 14;
      for (const item of display.clinicalNotes) {
        for (const line of wrapText(`• ${item}`, font, 9, contentWidth)) {
          page.drawText(line, {
            x: MARGIN,
            y,
            size: 9,
            font,
            color: TEXT,
          });
          y -= 12;
        }
      }
      y -= 8;
    }
  }

  // ── Footer ─────────────────────────────────────────────────
  y = Math.min(y, 140);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: contentRight, y },
    thickness: 0.8,
    color: LINE,
  });
  y -= 28;

  const sigWidth = 200;
  page.drawLine({
    start: { x: contentRight - sigWidth, y },
    end: { x: contentRight, y },
    thickness: 0.8,
    color: LINE,
  });
  y -= 14;
  page.drawText(display.signatureLabel, {
    x: contentRight - font.widthOfTextAtSize(display.signatureLabel, 9),
    y,
    size: 9,
    font,
    color: TEXT,
  });
  y -= 12;
  if (display.registrationNumber !== "NA") {
    const regLine = `Reg. No. ${display.registrationNumber}`;
    page.drawText(regLine, {
      x: contentRight - font.widthOfTextAtSize(regLine, 8),
      y,
      size: 8,
      font,
      color: MUTED,
    });
  }

  page.drawText(display.generatedVia, {
    x: MARGIN,
    y: 40,
    size: 8,
    font,
    color: MUTED,
  });

  return pdf.save();
}
