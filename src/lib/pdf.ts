import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import { fmtDate } from './format';
import { describeDegree, letterDate, monthYear } from './degrees';
import { UNIZIK_LOGO_PNG } from './pdf-logo';
import type { DocumentSettings } from './document-settings';

export const NAVY = rgb(0x0f / 255, 0x17 / 255, 0x2a / 255);
export const TEAL = rgb(0, 0x96 / 255, 0x89 / 255);
export const GREEN = rgb(0, 0x7a / 255, 0x55 / 255);
export const MUTED = rgb(0.28, 0.33, 0.41);
export const BLACK = rgb(0, 0, 0);
/** Crest blue and maroon, as on the CPGS letterhead. */
const CREST_BLUE = rgb(0x12 / 255, 0x1f / 255, 0x6b / 255);
const MAROON = rgb(0x8a / 255, 0x14 / 255, 0x18 / 255);

export type DocumentData = {
  kind: 'STATEMENT_OF_RESULT' | 'TRANSCRIPT';
  code: string;
  url: string;
  /** Letter reference, e.g. NAU/CPGS/R/ST/001/165. */
  reference: string;
  issuedTo: string;
  issuedToAddress?: string | null;
  issuedAt: Date;
  expiresAt: Date;
  settings: DocumentSettings;
  student: {
    surname: string; otherNames: string; matricNo: string; sex?: string | null;
    phone?: string | null; email?: string | null; address?: string | null; modeOfStudy?: string | null;
    dateRegistered?: Date | null; admission?: { qualification?: string | null; date?: string | null; institution?: string | null }[] | null;
  };
  programme: string;
  degreeType: string;
  department: string;
  faculty: string;
  session: string;
  cgpa?: number | null;
  classOfDegree?: string | null;
  /** Date the PG Board approved the result (stored as senateApprovalDate). */
  boardApprovalDate?: Date | null;
  boardMeeting?: string | null;
  effectiveDate?: Date | null;
  version: number;
  courses: { code: string; title?: string | null; units?: number | null; grade?: string | null }[];
};

/** Standard fonts only encode WinAnsi: fold diacritics (Ọ → O) and drop anything else. */
export function safe(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E -ÿ–—…·’]/g, '?');
}

function sanitise<T>(v: T): T {
  if (typeof v === 'string') return safe(v) as T;
  if (Array.isArray(v)) return v.map(sanitise) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitise(x)])) as T;
  }
  return v;
}

export function embedLogo(pdf: PDFDocument) {
  return pdf.embedPng(Buffer.from(UNIZIK_LOGO_PNG, 'base64'));
}

/** The UNIZIK crest on a white disc (it would not show on the navy letterhead otherwise), centred at (cx, cy). */
export function drawLogoBadge(page: PDFPage, logo: PDFImage, cx: number, cy: number, diameter: number) {
  page.drawCircle({ x: cx, y: cy, size: diameter / 2, color: rgb(1, 1, 1) });
  const h = diameter * 0.8, w = h * (logo.width / logo.height);
  page.drawImage(logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
}

export function truncate(s: string, font: PDFFont, size: number, max: number) {
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  while (s.length && font.widthOfTextAtSize(s + '…', size) > max) s = s.slice(0, -1);
  return s + '…';
}

const W = 595.28, H = 841.89, M = 56; // A4 portrait
/** Content stays above this line; the verification strip and vision statement sit below it. */
const BOTTOM = 118;

type Fonts = { font: PDFFont; bold: PDFFont; italic: PDFFont };
type Ctx = Fonts & { pdf: PDFDocument; d: DocumentData; logo: PDFImage; qr: PDFImage };

// ---------------------------------------------------------------------------------------------
// Rich text: words with optional bold/underline, ordinals ("15th") drawn with a raised suffix,
// laid out justified like the College's letters.

type Seg = { text: string; bold?: boolean; underline?: boolean };
type Word = { text: string; bold?: boolean; underline?: boolean };

const ORD = /^(.*\d)(st|nd|rd|th)(\W*)$/;

function wordWidth(w: Word, f: Fonts, size: number) {
  const font = w.bold ? f.bold : f.font;
  const m = w.text.match(ORD);
  if (!m) return font.widthOfTextAtSize(w.text, size);
  return font.widthOfTextAtSize(m[1], size) + font.widthOfTextAtSize(m[2], size * 0.62) + font.widthOfTextAtSize(m[3], size);
}

function drawWord(page: PDFPage, w: Word, x: number, y: number, f: Fonts, size: number, color: RGB) {
  const font = w.bold ? f.bold : f.font;
  const m = w.text.match(ORD);
  if (!m) {
    page.drawText(w.text, { x, y, size, font, color });
    return;
  }
  page.drawText(m[1], { x, y, size, font, color });
  let cx = x + font.widthOfTextAtSize(m[1], size);
  page.drawText(m[2], { x: cx, y: y + size * 0.38, size: size * 0.62, font, color });
  cx += font.widthOfTextAtSize(m[2], size * 0.62);
  if (m[3]) page.drawText(m[3], { x: cx, y, size, font, color });
}

/** Draws segments as one justified paragraph from (x, y) within `width`; returns the y below it. */
function paragraph(page: PDFPage, segs: Seg[], x: number, y: number, width: number, f: Fonts,
  { size = 11.5, leading = 18, justify = true, color = BLACK }: { size?: number; leading?: number; justify?: boolean; color?: RGB } = {}) {
  const words: Word[] = segs.flatMap((s) => s.text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, bold: s.bold, underline: s.underline })));
  const space = f.font.widthOfTextAtSize(' ', size);
  const lines: Word[][] = [];
  let line: Word[] = [], lineW = 0;
  for (const w of words) {
    const ww = wordWidth(w, f, size);
    if (line.length && lineW + space + ww > width) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
    lineW += (line.length ? space : 0) + ww;
    line.push(w);
  }
  if (line.length) lines.push(line);

  lines.forEach((ws, li) => {
    const widths = ws.map((w) => wordWidth(w, f, size));
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = justify && li < lines.length - 1 && ws.length > 1 ? (width - total) / (ws.length - 1) : space;
    let cx = x;
    ws.forEach((w, i) => {
      drawWord(page, w, cx, y, f, size, color);
      if (w.underline) {
        // Underline runs on through the gap to the next underlined word.
        const end = cx + widths[i] + (ws[i + 1]?.underline ? gap : 0);
        page.drawLine({ start: { x: cx, y: y - 2 }, end: { x: end, y: y - 2 }, thickness: 0.7, color });
      }
      cx += widths[i] + gap;
    });
    y -= leading;
  });
  return y;
}

/** One line of text, optionally underlined; returns its width. */
function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number,
  { color = BLACK, underline = false }: { color?: RGB; underline?: boolean } = {}) {
  page.drawText(s, { x, y, size, font, color });
  const w = font.widthOfTextAtSize(s, size);
  if (underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + w, y: y - 2 }, thickness: 0.7, color });
  return w;
}

/** Largest size up to `max` at which `s` fits `width`. */
function fit(s: string, font: PDFFont, width: number, max: number) {
  return Math.min(max, (width / font.widthOfTextAtSize(s, max)) * max);
}

/** The date at the right margin, e.g. "October 15th, 2026" with a raised ordinal. */
function dateRight(page: PDFPage, date: Date, y: number, f: Fonts, size = 11.5) {
  const words = letterDate(date).split(' ').map((t) => ({ text: t }));
  const space = f.font.widthOfTextAtSize(' ', size);
  const total = words.reduce((a, w) => a + wordWidth(w, f, size), 0) + space * (words.length - 1);
  let x = W - M - total;
  for (const w of words) {
    drawWord(page, w, x, y, f, size, BLACK);
    x += wordWidth(w, f, size) + space;
  }
}

// ---------------------------------------------------------------------------------------------
// Page furniture

/** The College letterhead: officers on the left, crest and name on the right. Returns the y below it. */
function letterhead(page: PDFPage, c: Ctx) {
  const s = c.d.settings;
  const crestH = 74, crestW = crestH * (c.logo.width / c.logo.height);
  const rightX = 318;
  page.drawImage(c.logo, { x: rightX + 6 - crestW / 2 + 40, y: H - 40 - crestH, width: crestW, height: crestH });

  // University and College names beside a double rule.
  const top = H - 128;
  page.drawLine({ start: { x: rightX - 10, y: top + 22 }, end: { x: rightX - 10, y: top - 30 }, thickness: 1.2, color: BLACK });
  page.drawLine({ start: { x: rightX - 6, y: top + 22 }, end: { x: rightX - 6, y: top - 30 }, thickness: 1.2, color: BLACK });
  const nameW = W - M + 20 - rightX;
  const uni = 'NNAMDI AZIKIWE UNIVERSITY, AWKA', col = 'COLLEGE OF POSTGRADUATE STUDIES';
  page.drawText(uni, { x: rightX, y: top, size: fit(uni, c.bold, nameW, 13), font: c.bold, color: CREST_BLUE });
  page.drawText(col, { x: rightX, y: top - 15, size: fit(col, c.bold, nameW, 13), font: c.bold, color: MAROON });
  page.drawText('P.M.B. 5025, AWKA, ANAMBRA STATE, NIGERIA', { x: rightX, y: top - 26, size: 6.5, font: c.bold, color: BLACK });

  // Provost and Secretary with their emails.
  let y = H - 98;
  const officer = (label: string, name: string, emails: string) => {
    const lw = text(page, `${label}:`, M - 16, y, c.bold, 8.5, { color: MAROON });
    text(page, name, M - 16 + lw + 4, y, c.font, 8.5);
    y -= 11;
    emails.split(',').map((e) => e.trim()).filter(Boolean).forEach((e, i) => {
      text(page, i ? e : `Email: ${e}`, M - 16 + (i ? c.font.widthOfTextAtSize('Email: ', 8.5) : 0), y, c.font, 8.5);
      y -= 11;
    });
    y -= 4;
  };
  officer('PROVOST', s.provostName, s.provostEmail);
  officer('SECRETARY', s.secretaryName, s.secretaryEmails);
  return Math.min(y, top - 30) - 26;
}

/** A faint crest in the lower right, as on the printed stationery. */
function watermark(page: PDFPage, c: Ctx) {
  const h = 250, w = h * (c.logo.width / c.logo.height);
  page.drawImage(c.logo, { x: W - w - 20, y: BOTTOM + 10, width: w, height: h, opacity: 0.06 });
}

/** QR code, verification code and the vision statement at the foot of every page. */
function footer(page: PDFPage, c: Ctx, { vision = true } = {}) {
  const q = 50;
  page.drawLine({ start: { x: M, y: BOTTOM - 8 }, end: { x: W - M, y: BOTTOM - 8 }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
  page.drawImage(c.qr, { x: W - M - q, y: BOTTOM - 14 - q, width: q, height: q });
  const tx = W - M - q - 10;
  const lines: [string, PDFFont, number, RGB][] = [
    [`Verification code ${c.d.code}`, c.bold, 8.5, NAVY],
    [`Verify this document at ${c.d.url}`, c.font, 7.5, TEAL],
    [`Valid until ${fmtDate(c.d.expiresAt)}. Record version ${c.d.version}. Any alteration renders this document invalid.`, c.font, 7, MUTED],
  ];
  lines.forEach(([s, font, size, color], i) => {
    page.drawText(s, { x: tx - font.widthOfTextAtSize(s, size), y: BOTTOM - 26 - i * 11, size, font, color });
  });
  if (vision && c.d.settings.vision) {
    const words = c.d.settings.vision.split(/\s+/);
    const rows: string[] = [];
    let row = '';
    for (const w of words) {
      const t = row ? `${row} ${w}` : w;
      if (c.italic.widthOfTextAtSize(t, 7.5) > W - 2 * M && row) {
        rows.push(row);
        row = w;
      } else row = t;
    }
    if (row) rows.push(row);
    rows.slice(0, 2).forEach((r, i) => {
      page.drawText(r, { x: (W - c.italic.widthOfTextAtSize(r, 7.5)) / 2, y: 30 - i * 10 + (rows.length > 1 ? 10 : 0), size: 7.5, font: c.italic, color: MUTED });
    });
  }
}

/** Signature space, then the Secretary's name and title. Returns the y below it. */
function signature(page: PDFPage, y: number, c: Ctx, gap = 44) {
  y -= gap;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + 150, y: y + 12 }, thickness: 0.4, color: rgb(0.7, 0.72, 0.76) });
  text(page, c.d.settings.secretaryName, M, y, c.bold, 11);
  text(page, c.d.settings.secretaryTitle, M, y - 14, c.bold, 11);
  text(page, 'College of Postgraduate Studies.', M, y - 28, c.bold, 11);
  return y - 42;
}

const withPrefix = (name: string, prefix: string) => (new RegExp(`^${prefix}\\b`, 'i').test(name.trim()) ? name.trim() : `${prefix} ${name.trim()}`);
const initials = (otherNames: string) => otherNames.split(/[\s-]+/).filter(Boolean).map((n) => `${n[0].toUpperCase()}.`).join(' ');

// ---------------------------------------------------------------------------------------------
// Statement of result: the "Higher Degree Examination Result" letter to the graduand.

function statement(c: Ctx) {
  const { d } = c;
  const page = c.pdf.addPage([W, H]);
  watermark(page, c);
  let y = letterhead(page, c);

  text(page, d.reference, M, y, c.font, 11.5);
  dateRight(page, d.issuedAt, y, c);
  y -= 34;

  const surname = d.student.surname.toUpperCase();
  const addressee = [
    [`${surname}, ${d.student.otherNames.toUpperCase()}`, true],
    [`Reg. No: ${d.student.matricNo}`, false],
    [withPrefix(d.department, 'Department of'), false],
    [withPrefix(d.faculty, 'Faculty of'), false],
    ['Nnamdi Azikiwe University', false],
    ['Awka.', false],
  ] as const;
  for (const [s, b] of addressee) {
    text(page, s, M, y, b ? c.bold : c.font, 11.5);
    y -= 15;
  }
  y -= 14;
  text(page, 'Dear ', M, y, c.font, 11.5);
  text(page, `${surname}, ${initials(d.student.otherNames)}`, M + c.font.widthOfTextAtSize('Dear ', 11.5), y, c.bold, 11.5);
  y -= 30;
  text(page, 'HIGHER DEGREE EXAMINATION RESULT', M, y, c.bold, 11.5, { underline: true });
  y -= 28;

  const deg = describeDegree(d.programme, d.degreeType, d.department);
  const meeting = d.boardMeeting ? `${d.boardMeeting.replace(/\s*(PG\s*)?Board(\s*Meeting)?$/i, '')} ` : '';
  const held = d.boardApprovalDate ? ` held on ${letterDate(d.boardApprovalDate)}` : '';
  y = paragraph(page, [
    { text: `I am pleased to inform you that on the recommendations of the ${withPrefix(d.faculty, 'Faculty of')} and the Board, College of Postgraduate Studies, during its ${meeting}Board Meeting${held}, the Senate has approved that the Degree of ${deg.degree} in ${deg.field} of this University be awarded to you.` },
  ], M, y, W - 2 * M, c);
  if (d.effectiveDate) {
    y = paragraph(page, [{ text: 'The effective date of the award is' }, { text: letterDate(d.effectiveDate), bold: true, underline: true }], M, y, W - 2 * M, c);
  }
  y -= 8;
  text(page, 'Please, accept our congratulations.', M, y, c.font, 11.5);
  y -= 30;
  text(page, 'Yours sincerely,', M, y, c.font, 11.5);
  signature(page, y, c, 52);
  footer(page, c);
}

// ---------------------------------------------------------------------------------------------
// Transcript: forwarding letter to the receiving institution, then SPGS Form 044.

const pronoun = (sex?: string | null) => (sex === 'F' ? 'her' : sex === 'M' ? 'his' : null);

function forwardingLetter(c: Ctx) {
  const { d } = c;
  const page = c.pdf.addPage([W, H]);
  watermark(page, c);
  let y = letterhead(page, c);

  text(page, d.reference, M, y, c.font, 11.5);
  dateRight(page, d.issuedAt, y, c);
  y -= 34;

  const recipient = [d.issuedTo, ...(d.issuedToAddress ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)];
  recipient.forEach((l) => {
    text(page, truncate(l, c.font, 11.5, W - 2 * M), M, y, c.font, 11.5);
    y -= 15;
  });
  y -= 22;

  const name = `${d.student.surname.toUpperCase()}, ${d.student.otherNames.toUpperCase()}`;
  for (const l of [
    'FORWARDING OF ACADEMIC TRANSCRIPT IN FAVOUR OF:',
    `NAME:  ${name}`,
    withPrefix(d.department, 'Department of').toUpperCase(),
    withPrefix(d.faculty, 'Faculty of').toUpperCase(),
  ]) {
    text(page, truncate(l, c.bold, 11.5, W - 2 * M), M, y, c.bold, 11.5, { underline: true });
    y -= 16;
  }
  y -= 22;

  const his = pronoun(d.student.sex);
  y = paragraph(page, [{ text: `I write to forward to you, at the instance of the above-named candidate, the academic transcript in ${his ?? "the candidate's"} favour for your necessary action.` }], M, y, W - 2 * M, c);
  y -= 10;
  y = paragraph(page, [{ text: `Please note that the academic transcript is a confidential document and should on no account be given to the candidate for ${his ? `${his} ` : ''}private use.` }], M, y, W - 2 * M, c);
  signature(page, y - 40, c, 70);
  footer(page, c);
}

const FOUR_POINT = [['A', 'Excellent', '4.00'], ['AB', 'Very Good', '3.50'], ['B', 'Good', '3.00'], ['BC', 'Fair', '2.50'], ['C', 'Pass', '2.00'], ['CD', 'Weak', '1.50']];
const FIVE_POINT = [['A', 'Excellent', '5.00'], ['B', 'Very Good', '4.00'], ['C', 'Good', '3.00'], ['D', 'Fair', '2.00'], ['E', 'Pass', '1.00'], ['F', 'Fail', '0.00']];

function formPage(c: Ctx, first: boolean) {
  const page = c.pdf.addPage([W, H]);
  watermark(page, c);
  const form = `${c.d.settings.transcriptFormNo}${first ? '' : ' (continued)'}`;
  if (form.trim()) text(page, form, W - M - c.bold.widthOfTextAtSize(form, 7.5), H - 36, c.bold, 7.5);
  const crestH = 44;
  page.drawImage(c.logo, { x: M, y: H - 52 - crestH + 8, width: crestH * (c.logo.width / c.logo.height), height: crestH });
  for (const [i, s] of ['NNAMDI AZIKIWE UNIVERSITY, AWKA', 'COLLEGE OF POSTGRADUATE STUDIES'].entries()) {
    text(page, s, (W - c.bold.widthOfTextAtSize(s, 12.5)) / 2, H - 58 - i * 16, c.bold, 12.5);
  }
  return page;
}

function transcriptForm(c: Ctx) {
  const { d } = c;
  const s = d.student;
  let page = formPage(c, true);
  let y = H - 100;
  dateRight(page, d.issuedAt, y, c, 11);
  y -= 16;
  text(page, "POSTGRADUATE STUDENT'S ACADEMIC RECORD AND TRANSCRIPT", M, y, c.bold, 11, { underline: true });
  y -= 18;

  // Label: value pairs, two to a line where the form has them side by side.
  const C2 = M + 290, SIZE = 10, LH = 14;
  const field = (label: string, value: string | null | undefined, x: number, yy: number, max: number) => {
    const lw = text(page, `${label}: `, x, yy, c.bold, SIZE);
    text(page, truncate(value ?? '', c.font, SIZE, max - lw), x + lw, yy, c.font, SIZE);
  };
  const deg = describeDegree(d.programme, d.degreeType, d.department);
  const rows: [string, string | null | undefined, string?, (string | null | undefined)?][] = [
    ['Name', `${s.surname.toUpperCase()}, ${s.otherNames.toUpperCase()}`, 'Sex', s.sex === 'F' ? 'Female' : s.sex === 'M' ? 'Male' : ''],
    ['Faculty', d.faculty.replace(/^Faculty of\s+/i, ''), 'Session', d.session],
    ['Dept', d.department.replace(/^Department of\s+/i, ''), 'Reg. No', s.matricNo],
    ['Phone No', s.phone, 'Email', s.email],
    ['Permanent Address', s.address],
    ['Degree or Diploma', deg.degree, 'Mode of Study', s.modeOfStudy === 'PART_TIME' ? 'Part Time' : s.modeOfStudy === 'FULL_TIME' ? 'Full Time' : ''],
    ['Receiving Institution/Organization', d.issuedTo],
  ];
  for (const [l1, v1, l2, v2] of rows) {
    field(l1, v1, M, y, l2 ? C2 - M - 8 : W - 2 * M);
    if (l2) field(l2, v2, C2, y, W - M - C2);
    y -= LH;
  }

  // Basis of admission.
  text(page, 'BASIS OF ADMISSION', M, y, c.bold, SIZE);
  y -= LH;
  const AX = [M, M + 200, M + 270];
  text(page, 'Qualification & Class', AX[0], y, c.bold, SIZE, { underline: true });
  text(page, 'Date', AX[1], y, c.bold, SIZE, { underline: true });
  text(page, 'Institutions where obtained', AX[2], y, c.bold, SIZE, { underline: true });
  y -= LH;
  for (const a of s.admission?.length ? s.admission : [{}]) {
    text(page, truncate(a.qualification ?? '', c.font, SIZE, 190), AX[0], y, c.font, SIZE);
    text(page, truncate(a.date ?? '', c.font, SIZE, 64), AX[1], y, c.font, SIZE);
    text(page, truncate(a.institution ?? '', c.font, SIZE, W - M - AX[2]), AX[2], y, c.font, SIZE);
    y -= LH;
  }
  field('Date Registered', s.dateRegistered ? monthYear(s.dateRegistered) : '', M, y, W - 2 * M);
  y -= LH + 2;

  // Courses, in a ruled table that continues on the next page if needed.
  const CX = [M, M + 64, W - M - 92, W - M - 46, W - M];
  const ROW = 14;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: ROW, borderColor: BLACK, borderWidth: 0.6 });
    ['Course No', 'Title of Course', 'Credit', 'Grade'].forEach((h, i) => text(page, h, CX[i] + 3, y, c.bold, SIZE));
    CX.slice(1, 4).forEach((x) => page.drawLine({ start: { x, y: y - 4 }, end: { x, y: y - 4 + ROW }, thickness: 0.6, color: BLACK }));
    y -= ROW;
  };
  head();
  for (const course of d.courses) {
    if (y < BOTTOM + 10) {
      footer(page, c, { vision: false });
      page = formPage(c, false);
      y = H - 110;
      head();
    }
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: ROW, borderColor: BLACK, borderWidth: 0.6 });
    CX.slice(1, 4).forEach((x) => page.drawLine({ start: { x, y: y - 4 }, end: { x, y: y - 4 + ROW }, thickness: 0.6, color: BLACK }));
    text(page, truncate(course.code, c.font, SIZE, CX[1] - CX[0] - 6), CX[0] + 3, y, c.font, SIZE);
    text(page, truncate(course.title ?? '', c.font, SIZE, CX[2] - CX[1] - 6), CX[1] + 3, y, c.font, SIZE);
    const units = course.units != null ? String(course.units) : '';
    text(page, units, CX[3] - 8 - c.font.widthOfTextAtSize(units, SIZE), y, c.font, SIZE);
    text(page, course.grade ?? '', CX[3] + 16, y, c.font, SIZE);
    y -= ROW;
  }

  // Result, award and grading system: kept together.
  if (y - 230 < BOTTOM) {
    footer(page, c, { vision: false });
    page = formPage(c, false);
    y = H - 110;
  }
  y -= 2;
  field('Result', d.classOfDegree === 'FAIL' ? 'Failed' : 'Passed', M, y, 200);
  if (d.cgpa != null) {
    const v = d.cgpa.toFixed(2);
    const vw = c.bold.widthOfTextAtSize(v, SIZE);
    text(page, v, W - M - vw, y, c.bold, SIZE);
    text(page, '(on 5-Point Scale)', W - M - vw - 14 - c.bold.widthOfTextAtSize('(on 5-Point Scale)', SIZE), y, c.bold, SIZE);
  }
  y -= LH;
  field('Degree Awarded', deg.degree, M, y, W - 2 * M);
  y -= LH;
  field('Area of Specialization', deg.specialization, M, y, W - 2 * M);
  y -= LH;
  const awarded = d.effectiveDate ?? d.boardApprovalDate;
  const lw = text(page, 'Date Awarded: ', M, y, c.bold, SIZE);
  if (awarded) drawWordsInline(page, letterDate(awarded), M + lw, y, c, SIZE);
  y -= LH;
  text(page, 'THIS IS A CERTIFIED TRUE COPY OF THE RECORD IN THIS UNIVERSITY GRADING SYSTEM', M, y, c.bold, SIZE, { underline: true });
  y -= LH + 2;

  const scale = (title: string, rowsOf: string[][], x: number) => {
    text(page, title, x + 24, y, c.bold, SIZE, { underline: true });
    rowsOf.forEach(([g, label, p], i) => {
      const yy = y - (i + 1) * 13;
      text(page, g, x, yy, c.font, SIZE);
      text(page, `- ${label}`, x + 28, yy, c.font, SIZE);
      text(page, p, x + 130, yy, c.font, SIZE);
    });
  };
  scale('4 Point Scale', FOUR_POINT, M);
  scale('5 Point Scale', FIVE_POINT, C2);
  y -= 7 * 13 + 4;
  signature(page, y, c, 40);
  footer(page, c, { vision: false });
}

/** Words with raised ordinals, left to right from x. */
function drawWordsInline(page: PDFPage, s: string, x: number, y: number, f: Fonts, size: number) {
  const space = f.font.widthOfTextAtSize(' ', size);
  for (const t of s.split(' ')) {
    drawWord(page, { text: t }, x, y, f, size, BLACK);
    x += wordWidth({ text: t }, f, size) + space;
  }
}

export async function renderResultDocument(input: DocumentData) {
  const d = sanitise(input);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind === 'TRANSCRIPT' ? 'Academic Transcript' : 'Statement of Result'} - ${d.student.matricNo}`);
  pdf.setAuthor('College of Postgraduate Studies, Nnamdi Azikiwe University');
  pdf.setSubject(`Verification code ${d.code}`);

  const c: Ctx = {
    pdf, d,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    logo: await embedLogo(pdf),
    qr: await pdf.embedPng(await QRCode.toBuffer(d.url, { margin: 1, width: 240, color: { dark: '#0f172a' } })),
  };
  if (d.kind === 'TRANSCRIPT') {
    forwardingLetter(c);
    transcriptForm(c);
  } else {
    statement(c);
  }
  return pdf.save();
}
