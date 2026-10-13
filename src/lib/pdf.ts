import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { CLASS_LABELS, fmtProjectGrade, semesterGpa, semesterGroups, type ClassOfDegree } from './grading';
import { fmtDate } from './format';

export const NAVY = rgb(0x0f / 255, 0x17 / 255, 0x2a / 255);
export const TEAL = rgb(0, 0x96 / 255, 0x89 / 255);
export const GREEN = rgb(0, 0x7a / 255, 0x55 / 255);
export const MUTED = rgb(0.28, 0.33, 0.41);
export const BLACK = rgb(0, 0, 0);

export type DocumentData = {
  kind: 'STATEMENT_OF_RESULT' | 'TRANSCRIPT';
  code: string;
  url: string;
  issuedTo: string;
  issuedAt: Date;
  expiresAt: Date;
  student: { name: string; matricNo: string; sex?: string | null };
  degree: string;
  department: string;
  faculty: string;
  session: string;
  cgpa?: number | null;
  classOfDegree?: string | null;
  thesisTitle?: string | null;
  senateApprovalDate?: Date | null;
  semesterGpas?: number[] | null;
  projectGrade?: number | null;
  effectiveDate?: Date | null;
  version: number;
  courses: { code: string; title?: string | null; units?: number | null; score?: number | null; grade?: string | null; semester?: number | null }[];
};

/** Standard fonts only encode WinAnsi: fold diacritics (Ọ → O) and drop anything else. */
export function safe(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E -ÿ–—…·]/g, '?');
}

function sanitise<T>(v: T): T {
  if (typeof v === 'string') return safe(v) as T;
  if (Array.isArray(v)) return v.map(sanitise) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitise(x)])) as T;
  }
  return v;
}

export async function renderResultDocument(input: DocumentData) {
  const d = sanitise(input);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind === 'TRANSCRIPT' ? 'Academic Transcript' : 'Statement of Result'} - ${d.student.matricNo}`);
  pdf.setAuthor('College of Postgraduate Studies, Nnamdi Azikiwe University');
  pdf.setSubject(`Verification code ${d.code}`);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qr = await pdf.embedPng(await QRCode.toBuffer(d.url, { margin: 1, width: 240, color: { dark: '#0f172a' } }));

  let page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const M = 48;

  // Letterhead
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: NAVY });
  page.drawRectangle({ x: 0, y: height - 100, width, height: 4, color: TEAL });
  page.drawText('NNAMDI AZIKIWE UNIVERSITY, AWKA', { x: M, y: height - 44, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText('College of Postgraduate Studies  ·  Records Unit', { x: M, y: height - 64, size: 10.5, font, color: rgb(0.85, 0.92, 0.91) });
  page.drawText('P.M.B. 5025, Awka, Anambra State, Nigeria', { x: M, y: height - 80, size: 9, font, color: rgb(0.7, 0.76, 0.8) });

  let y = height - 140;
  const title = d.kind === 'TRANSCRIPT' ? 'ACADEMIC TRANSCRIPT' : 'STATEMENT OF RESULT';
  page.drawText(title, { x: M, y, size: 16, font: bold, color: NAVY });
  y -= 18;
  page.drawText(`Issued ${fmtDate(d.issuedAt)} to ${d.issuedTo}`, { x: M, y, size: 9.5, font, color: MUTED });

  // QR + code block, top right
  page.drawImage(qr, { x: width - M - 92, y: height - 214, width: 92, height: 92 });
  page.drawText(d.code, { x: width - M - 92, y: height - 226, size: 10, font: bold, color: NAVY });

  y -= 34;
  const rows: [string, string][] = [
    ['Name', d.student.name],
    ['Matriculation number', d.student.matricNo],
    ['Degree', d.degree],
    ['Department', d.department],
    ['Faculty', d.faculty],
    ['Session', d.session],
    ['CGPA', d.cgpa != null ? d.cgpa.toFixed(2) : '—'],
    ['Class of degree', d.classOfDegree ? CLASS_LABELS[d.classOfDegree as ClassOfDegree] ?? d.classOfDegree : '—'],
    ['Senate approval', fmtDate(d.senateApprovalDate)],
  ];
  if (d.semesterGpas?.length) rows.push(['Semester GPAs', d.semesterGpas.map((g, i) => `${['1st', '2nd', '3rd', '4th'][i]}: ${g.toFixed(2)}`).join('  ·  ')]);
  if (d.projectGrade != null) rows.push(['Project', fmtProjectGrade(d.projectGrade)]);
  if (d.effectiveDate) rows.push(['Effective date of graduation', fmtDate(d.effectiveDate)]);
  if (d.thesisTitle) rows.push(['Thesis / dissertation', d.thesisTitle]);

  for (const [k, v] of rows) {
    page.drawText(k, { x: M, y, size: 9.5, font, color: MUTED });
    y = drawWrapped(page, v, M + 150, y, width - M * 2 - 150, bold, 10.5, BLACK);
    y -= 8;
  }

  if (d.kind === 'TRANSCRIPT' && d.courses.length) {
    y -= 10;
    page.drawText('COURSES', { x: M, y, size: 10, font: bold, color: GREEN });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.8, color: TEAL });
    y -= 14;
    const cols = [M, M + 80, M + 340, M + 390, M + 450];
    ['Code', 'Title', 'Units', 'Score', 'Grade'].forEach((h, i) =>
      page.drawText(h, { x: cols[i], y, size: 9, font: bold, color: NAVY }));
    y -= 14;
    // Grouped by semester when the semester is recorded (as on the semester result sheets).
    const groups = semesterGroups(d.courses);
    for (const [gi, g] of groups.entries()) {
      if (g.semester != null) {
        if (y < 140) {
          page = pdf.addPage([595.28, 841.89]);
          y = height - M;
        }
        if (gi > 0) y -= 4;
        const gpa = d.semesterGpas?.[g.semester - 1] ?? semesterGpa(g.courses, g.semester);
        const head = `${['FIRST', 'SECOND', 'THIRD', 'FOURTH'][g.semester - 1]} SEMESTER${gpa != null ? `   ·   GPA ${gpa.toFixed(2)}` : ''}`;
        page.drawText(head, { x: M, y, size: 8.5, font: bold, color: GREEN });
        y -= 13;
      } else if (groups.length > 1) {
        y -= 4;
        page.drawText('SEMESTER NOT RECORDED', { x: M, y, size: 8.5, font: bold, color: MUTED });
        y -= 13;
      }
      for (const c of g.courses) {
        if (y < 120) {
          page = pdf.addPage([595.28, 841.89]);
          y = height - M;
        }
        page.drawText(c.code, { x: cols[0], y, size: 9, font, color: BLACK });
        page.drawText(truncate(c.title ?? '', font, 9, 250), { x: cols[1], y, size: 9, font, color: BLACK });
        page.drawText(String(c.units ?? ''), { x: cols[2], y, size: 9, font, color: BLACK });
        page.drawText(c.score != null ? String(c.score) : '', { x: cols[3], y, size: 9, font, color: BLACK });
        page.drawText(c.grade ?? '', { x: cols[4], y, size: 9, font, color: BLACK });
        y -= 13;
      }
    }
    const units = d.courses.reduce((s, c) => s + (c.units ?? 0), 0);
    y -= 4;
    page.drawText(`Total units: ${units}`, { x: M, y, size: 9, font: bold, color: NAVY });
  }

  // Footer on every page
  for (const p of pdf.getPages()) {
    p.drawLine({ start: { x: M, y: 92 }, end: { x: width - M, y: 92 }, thickness: 0.5, color: rgb(0.89, 0.91, 0.94) });
    p.drawText(`Verify this document at ${d.url}`, { x: M, y: 76, size: 8.5, font: bold, color: TEAL });
    p.drawText(`Valid until ${fmtDate(d.expiresAt)}. Record version ${d.version}. Any alteration renders this document invalid.`,
      { x: M, y: 62, size: 8, font, color: MUTED });
    p.drawText('This document is issued electronically by the CPGS Results Repository and is valid without a signature when verified online.',
      { x: M, y: 50, size: 7.5, font, color: MUTED });
  }

  return pdf.save();
}

export function truncate(s: string, font: PDFFont, size: number, max: number) {
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  while (s.length && font.widthOfTextAtSize(s + '…', size) > max) s = s.slice(0, -1);
  return s + '…';
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxW: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>) {
  const words = text.split(/\s+/);
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > maxW && line) {
      page.drawText(line, { x, y, size, font, color });
      y -= size + 3;
      line = w;
    } else line = t;
  }
  if (line) page.drawText(line, { x, y, size, font, color });
  return y - size - 2;
}
