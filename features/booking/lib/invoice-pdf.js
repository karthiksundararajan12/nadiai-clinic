/**
 * @fileoverview Pure invoice PDF generation (pdf-lib — no headless browser).
 *
 * Builds a single-page consultation invoice with a professional layout:
 * header band, Bill To / Consultation Details columns, line-item table,
 * and payment footer. GST fields stay "NA" — never invent a GSTIN.
 *
 * Optional `clinicLogoUrl`: when present and fetchable as PNG/JPEG, embedded
 * top-left; missing/failed logos never fail PDF generation.
 *
 * Noto Sans is embedded (via @pdf-lib/fontkit) so the ₹ glyph renders —
 * Helvetica WinAnsi cannot encode it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { formatSlotLabel } from "./slot-engine.js";

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
  join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts"),
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
    `Invoice PDF font missing: ${filename} (${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

/**
 * Formats a per-clinic sequential sequence into a stable invoice number.
 * @param {number|bigint|string} seq
 * @returns {string}
 */
export function formatInvoiceNumber(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`invoice sequence must be a positive integer, got ${seq}`);
  }
  return `INV-${String(Math.trunc(n)).padStart(6, "0")}`;
}

/**
 * @param {number|string|null|undefined} amountRaw
 * @returns {{ amountNumber: number|null; consultationAmount: string; amountRupee: string }}
 */
function formatAmounts(amountRaw) {
  const amountNum =
    amountRaw == null || amountRaw === ""
      ? null
      : Number(amountRaw);
  if (amountNum == null || !Number.isFinite(amountNum)) {
    return {
      amountNumber: null,
      consultationAmount: "NA",
      amountRupee: "NA",
    };
  }
  const fixed = amountNum.toFixed(2);
  return {
    amountNumber: amountNum,
    // Keep INR form for field-value assertions / callers that expect it.
    consultationAmount: `INR ${fixed}`,
    amountRupee: `₹${fixed}`,
  };
}

/**
 * Builds the display values used on the PDF (also unit-tested for field
 * correctness without scraping PDF binary text).
 *
 * @param {{
 *   clinicName: string;
 *   clinicAddress?: string|null;
 *   clinicPhone?: string|null;
 *   clinicLogoUrl?: string|null;
 *   doctorName: string;
 *   patientName: string;
 *   patientPhone?: string|null;
 *   appointmentId?: string|null;
 *   slotStart: string|Date;
 *   consultationAmount: number|string|null|undefined;
 *   razorpayPaymentId: string;
 *   invoiceNumber: string;
 *   invoiceDate?: string|Date|null;
 * }} fields
 */
export function buildInvoiceDisplayFields(fields) {
  const slotStart =
    fields.slotStart instanceof Date
      ? fields.slotStart
      : new Date(fields.slotStart);

  const invoiceDateRaw = fields.invoiceDate
    ? fields.invoiceDate instanceof Date
      ? fields.invoiceDate
      : new Date(fields.invoiceDate)
    : new Date();

  const amounts = formatAmounts(fields.consultationAmount);
  const doctorName = fields.doctorName?.trim() || "NA";

  return {
    title: "INVOICE",
    invoiceNumber: fields.invoiceNumber,
    invoiceDateLabel: Number.isNaN(invoiceDateRaw.getTime())
      ? "NA"
      : formatInvoiceDate(invoiceDateRaw),
    clinicName: fields.clinicName?.trim() || "Clinic",
    clinicAddress: fields.clinicAddress?.trim() || "NA",
    clinicPhone: fields.clinicPhone?.trim() || "NA",
    clinicLogoUrl: fields.clinicLogoUrl?.trim() || null,
    doctorName,
    patientName: fields.patientName?.trim() || "NA",
    patientPhone: fields.patientPhone?.trim() || "NA",
    appointmentId: fields.appointmentId?.trim() || "NA",
    appointmentDateTime: Number.isNaN(slotStart.getTime())
      ? "NA"
      : formatSlotLabel(slotStart),
    consultationAmount: amounts.consultationAmount,
    amountRupee: amounts.amountRupee,
    lineItemDescription:
      doctorName === "NA"
        ? "Consultation"
        : `Consultation with ${doctorName}`,
    razorpayPaymentId: fields.razorpayPaymentId?.trim() || "NA",
    paymentMethod: "Paid via Razorpay",
    // GST not configured per clinic yet — leave blank/NA, never invent a GSTIN.
    gstin: "NA",
    cgst: "NA",
    sgst: "NA",
    gstNote: "GST: NA",
    thankYou: "Thank you for choosing us. We look forward to seeing you.",
  };
}

/** @param {Date} date */
function formatInvoiceDate(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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
 * Best-effort logo embed. Never throws — missing/invalid URLs return null.
 * @param {PDFDocument} pdf
 * @param {string|null|undefined} logoUrl
 */
async function tryEmbedLogo(pdf, logoUrl) {
  if (!logoUrl || typeof logoUrl !== "string") return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 8) return null;

    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;

    if (isPng) return await pdf.embedPng(bytes);
    if (isJpg) return await pdf.embedJpg(bytes);

    // Fallback: try PNG then JPG based on URL extension.
    const lower = logoUrl.toLowerCase();
    if (lower.includes(".png")) return await pdf.embedPng(bytes);
    if (lower.includes(".jpg") || lower.includes(".jpeg")) return await pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

/**
 * Generates a PDF invoice and returns its bytes.
 *
 * @param {Parameters<typeof buildInvoiceDisplayFields>[0]} fields
 * @returns {Promise<Uint8Array>}
 */
export async function generateInvoicePdf(fields) {
  const display = buildInvoiceDisplayFields(fields);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(loadFontBytes("NotoSans-Regular.ttf"));
  const fontBold = await pdf.embedFont(loadFontBytes("NotoSans-Bold.ttf"));

  const contentRight = PAGE_WIDTH - MARGIN;
  const contentWidth = contentRight - MARGIN;
  let y = PAGE_HEIGHT - MARGIN;

  const logo = await tryEmbedLogo(pdf, display.clinicLogoUrl);
  const logoSize = 42;
  let leftTextX = MARGIN;

  // ── Header band ──────────────────────────────────────────────
  if (logo) {
    const dims = logo.scale(1);
    const scale = Math.min(logoSize / dims.width, logoSize / dims.height);
    const w = dims.width * scale;
    const h = dims.height * scale;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - h,
      width: w,
      height: h,
    });
    leftTextX = MARGIN + w + 12;
  }

  const headerTop = y;
  page.drawText(display.clinicName, {
    x: leftTextX,
    y: headerTop - 14,
    size: 18,
    font: fontBold,
    color: ACCENT,
    maxWidth: 280,
  });

  let leftY = headerTop - 32;
  const leftMetaSize = 9;
  for (const line of wrapText(display.clinicAddress, font, leftMetaSize, 260)) {
    page.drawText(line, {
      x: leftTextX,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }
  if (display.clinicPhone && display.clinicPhone !== "NA") {
    page.drawText(display.clinicPhone, {
      x: leftTextX,
      y: leftY,
      size: leftMetaSize,
      font,
      color: MUTED,
    });
    leftY -= 12;
  }

  // Right: INVOICE + number + date
  const invoiceLabel = display.title;
  const invoiceLabelSize = 20;
  const invoiceLabelWidth = fontBold.widthOfTextAtSize(invoiceLabel, invoiceLabelSize);
  page.drawText(invoiceLabel, {
    x: contentRight - invoiceLabelWidth,
    y: headerTop - 14,
    size: invoiceLabelSize,
    font: fontBold,
    color: ACCENT,
  });

  const invNum = display.invoiceNumber;
  const invNumWidth = font.widthOfTextAtSize(invNum, 10);
  page.drawText(invNum, {
    x: contentRight - invNumWidth,
    y: headerTop - 32,
    size: 10,
    font,
    color: TEXT,
  });

  const dateLabel = `Date: ${display.invoiceDateLabel}`;
  const dateWidth = font.widthOfTextAtSize(dateLabel, 9);
  page.drawText(dateLabel, {
    x: contentRight - dateWidth,
    y: headerTop - 46,
    size: 9,
    font,
    color: MUTED,
  });

  y = Math.min(leftY, headerTop - 58) - 8;

  // Accent rule under header
  page.drawRectangle({
    x: MARGIN,
    y: y - 3,
    width: contentWidth,
    height: 3,
    color: ACCENT,
  });
  y -= 28;

  // ── Bill To / Consultation Details ───────────────────────────
  const colGap = 24;
  const colWidth = (contentWidth - colGap) / 2;
  const leftColX = MARGIN;
  const rightColX = MARGIN + colWidth + colGap;

  page.drawText("Bill To", {
    x: leftColX,
    y,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  page.drawText("Consultation Details", {
    x: rightColX,
    y,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  y -= 4;
  page.drawLine({
    start: { x: leftColX, y },
    end: { x: leftColX + colWidth, y },
    thickness: 0.6,
    color: LINE,
  });
  page.drawLine({
    start: { x: rightColX, y },
    end: { x: rightColX + colWidth, y },
    thickness: 0.6,
    color: LINE,
  });
  y -= 16;

  /** @param {number} x @param {number} startY @param {Array<[string, string]>} rows */
  const drawLabeledBlock = (x, startY, rows) => {
    let cursor = startY;
    for (const [label, value] of rows) {
      page.drawText(label, {
        x,
        y: cursor,
        size: 8,
        font,
        color: MUTED,
      });
      cursor -= 12;
      const valueLines = wrapText(value, fontBold, 10, colWidth);
      for (const line of valueLines) {
        page.drawText(line, {
          x,
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

  const leftBottom = drawLabeledBlock(leftColX, y, [
    ["Patient", display.patientName],
    ["Phone", display.patientPhone],
  ]);
  const rightBottom = drawLabeledBlock(rightColX, y, [
    ["Doctor", display.doctorName],
    ["Appointment", display.appointmentDateTime],
    ["Appointment ID", display.appointmentId],
  ]);
  y = Math.min(leftBottom, rightBottom) - 10;

  // ── Line-item table ──────────────────────────────────────────
  const tableHeaderH = 22;
  const tableRowH = 26;
  const descColX = MARGIN + 10;
  const amountColRight = contentRight - 10;
  const amountColWidth = 90;

  // Header row (shaded)
  page.drawRectangle({
    x: MARGIN,
    y: y - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: ACCENT,
  });
  page.drawText("Description", {
    x: descColX,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  const amountHeader = "Amount";
  page.drawText(amountHeader, {
    x: amountColRight - fontBold.widthOfTextAtSize(amountHeader, 9),
    y: y - 15,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  y -= tableHeaderH;

  // Body row
  page.drawRectangle({
    x: MARGIN,
    y: y - tableRowH,
    width: contentWidth,
    height: tableRowH,
    borderColor: LINE,
    borderWidth: 0.8,
    color: WHITE,
  });
  const descLines = wrapText(display.lineItemDescription, font, 10, contentWidth - amountColWidth - 28);
  page.drawText(descLines[0] ?? display.lineItemDescription, {
    x: descColX,
    y: y - 17,
    size: 10,
    font,
    color: TEXT,
  });
  page.drawText(display.amountRupee, {
    x: amountColRight - font.widthOfTextAtSize(display.amountRupee, 10),
    y: y - 17,
    size: 10,
    font,
    color: TEXT,
  });
  y -= tableRowH;

  // Total row
  const totalRowH = 28;
  page.drawRectangle({
    x: MARGIN,
    y: y - totalRowH,
    width: contentWidth,
    height: totalRowH,
    color: ACCENT_LIGHT,
    borderColor: LINE,
    borderWidth: 0.8,
  });
  const totalLabel = `Total: ${display.amountRupee}`;
  page.drawText(totalLabel, {
    x: amountColRight - fontBold.widthOfTextAtSize(totalLabel, 12),
    y: y - 18,
    size: 12,
    font: fontBold,
    color: ACCENT,
  });
  y -= totalRowH + 36;

  // ── Footer ───────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: contentRight, y },
    thickness: 0.8,
    color: LINE,
  });
  y -= 18;

  page.drawText("Payment", {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  y -= 14;
  page.drawText(`Payment ID: ${display.razorpayPaymentId}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: TEXT,
  });
  y -= 12;
  page.drawText(display.paymentMethod, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: TEXT,
  });
  y -= 12;
  page.drawText(display.gstNote, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: MUTED,
  });

  y -= 28;
  page.drawText(display.thankYou, {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: TEXT,
  });

  y -= 24;
  page.drawText("Generated by Nadi AI · This is a computer-generated invoice.", {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: MUTED,
  });

  return pdf.save();
}
