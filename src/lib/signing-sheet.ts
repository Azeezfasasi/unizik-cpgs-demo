import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BLACK, GREEN, MUTED, NAVY, TEAL, safe, truncate } from './pdf';
import { CLASS_LABELS, type ClassOfDegree } from './grading';
import { fmtDateTime } from './format';

export type SigningSheetData = {
  /** ONLINE: department final result sheet. LEGACY: taskforce certified transcription of an archived sheet. */
  kind: 'ONLINE' | 'LEGACY';
  boxCode?: string;
  reference: string;
  fingerprint: string;
  faculty: string;
  department: string;
  programme: string;
  session: string;
  generatedAt: Date;
  rows: { matricNo: string; name: string; sex?: string | null; cgpa?: number | null; classOfDegree?: string | null; thesisTitle?: string | null }[];
};

const W = 841.89, H = 595.28, M = 36; // A4 landscape

/** Wording that differs between a department submission and a legacy transcription. */
const TEXT = {
  ONLINE: {
    title: 'FINAL RESULT SHEET OF POSTGRADUATE GRADUANDS',
    certify: (d: SigningSheetData) => [
      `We certify that the ${d.rows.length} result(s) listed above are the true and final results of the graduands of the ${d.programme} programme for the ${d.session} session,`,
      'as approved by the Department, and that they agree with the records submitted to the College of Postgraduate Studies.',
    ],
    roles: ['Departmental PG Coordinator', 'Head of Department', 'External Examiner'],
    stamp: 'DEPARTMENT STAMP',
  },
  LEGACY: {
    title: 'CERTIFIED TRANSCRIPTION OF LEGACY RESULT SHEET',
    certify: (d: SigningSheetData) => [
      `We certify that the ${d.rows.length} result(s) listed above were transcribed from the original result sheet of the ${d.programme} programme for the ${d.session} session`,
      `held in archive box ${d.boxCode ?? '-'}, and checked against the original. The original sheet and its scan remain the legal source.`,
    ],
    roles: ['Indexer', 'QA Reviewer', 'Taskforce Lead'],
    stamp: 'RECORDS UNIT STAMP',
  },
} as const;
const LINE = rgb(0.85, 0.88, 0.92);
const ROW_H = 17;
const LINE_H = 10.5;

/** Table columns: x offset from the margin and width. */
const COLS = [
  { key: 'sn', label: 'S/N', w: 30 },
  { key: 'matric', label: 'Matric No', w: 92 },
  { key: 'name', label: 'Name (Surname first)', w: 200 },
  { key: 'sex', label: 'Sex', w: 32 },
  { key: 'cgpa', label: 'CGPA', w: 44 },
  { key: 'class', label: 'Class of degree', w: 92 },
  { key: 'thesis', label: 'Thesis / dissertation title', w: W - 2 * M - 490 },
] as const;

/**
 * Print-ready final result sheet generated from a submission's rows. The department prints it,
 * collects signatures and the stamp, scans it and attaches the scan as the legal source.
 */
export async function renderSigningSheet(input: SigningSheetData) {
  const d = {
    ...input,
    faculty: safe(input.faculty), department: safe(input.department), programme: safe(input.programme),
    rows: input.rows.map((r) => ({ ...r, name: safe(r.name), thesisTitle: r.thesisTitle ? safe(r.thesisTitle) : '' })),
  };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind === 'LEGACY' ? 'Certified transcription' : 'Result sheet for signing'} - ${d.reference}`);
  pdf.setAuthor('College of Postgraduate Studies, Nnamdi Azikiwe University');
  pdf.setSubject(`Row fingerprint ${d.fingerprint}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = newPage(pdf, d, font, bold);
  let y = tableTop(page, bold);

  const thesisW = COLS[COLS.length - 1].w - 6;
  d.rows.forEach((r, i) => {
    // The thesis title wraps (up to 3 lines) so the signed sheet shows it in full; the row grows to fit.
    const thesis = wrap(r.thesisTitle ?? '', font, 8.5, thesisW, 3);
    const rowH = ROW_H + (thesis.length - 1) * LINE_H;
    if (y - rowH + ROW_H < M + 40) {
      page = newPage(pdf, d, font, bold);
      y = tableTop(page, bold);
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + ROW_H - 5, width: W - 2 * M, height: rowH, color: rgb(0.97, 0.98, 0.98) });
    const cells = [
      String(i + 1), r.matricNo, r.name, r.sex ?? '', r.cgpa != null ? r.cgpa.toFixed(2) : '',
      r.classOfDegree ? CLASS_LABELS[r.classOfDegree as ClassOfDegree] ?? r.classOfDegree : '',
    ];
    let x = M;
    COLS.forEach((c, ci) => {
      if (ci < cells.length) {
        page.drawText(truncate(cells[ci], font, 8.5, c.w - 6), { x: x + 3, y, size: 8.5, font: ci === 1 ? bold : font, color: BLACK });
      } else {
        thesis.forEach((line, li) => page.drawText(line, { x: x + 3, y: y - li * LINE_H, size: 8.5, font, color: BLACK }));
      }
      x += c.w;
    });
    y -= rowH;
  });
  page.drawLine({ start: { x: M, y: y + ROW_H - 5 }, end: { x: W - M, y: y + ROW_H - 5 }, thickness: 0.8, color: NAVY });
  y -= 6;
  page.drawText(`Total number of graduands: ${d.rows.length}`, { x: M, y, size: 9.5, font: bold, color: NAVY });

  // Certification and signatures, kept together on one page.
  const BLOCK = 175;
  if (y - BLOCK < M + 26) {
    page = newPage(pdf, d, font, bold);
    y = H - 150;
  } else {
    y -= 24;
  }
  drawCertification(page, y, d, font, bold);

  // Footers once the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: W - M, y: M + 14 }, thickness: 0.5, color: LINE });
    p.drawText(`${d.reference}   ·   Row fingerprint ${d.fingerprint}   ·   Generated ${fmtDateTime(d.generatedAt)} from the CPGS Results Repository`,
      { x: M, y: M, size: 7.5, font, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7.5), y: M, size: 7.5, font: bold, color: NAVY });
  });

  return pdf.save();
}

/** Splits text into at most `maxLines` lines that fit `width`; the last line is truncated if needed. */
function wrap(text: string, font: PDFFont, size: number, width: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.length ? lines : [''];
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, font, size, width);
  return kept;
}

function newPage(pdf: PDFDocument, d: SigningSheetData, font: PDFFont, bold: PDFFont) {
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 52, width: W, height: 52, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 55, width: W, height: 3, color: TEAL });
  page.drawText('NNAMDI AZIKIWE UNIVERSITY, AWKA', { x: M, y: H - 26, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText('College of Postgraduate Studies', { x: M, y: H - 42, size: 9.5, font, color: rgb(0.85, 0.92, 0.91) });
  const ref = `Ref: ${d.reference}`;
  page.drawText(ref, { x: W - M - bold.widthOfTextAtSize(ref, 10), y: H - 32, size: 10, font: bold, color: rgb(1, 1, 1) });

  page.drawText(TEXT[d.kind].title, { x: M, y: H - 80, size: 12.5, font: bold, color: NAVY });
  const meta: [string, string][] = [
    ['Faculty', d.faculty], ['Department', d.department], ['Programme', d.programme], ['Session', d.session],
    ...(d.kind === 'LEGACY' ? [['Archive box', d.boxCode ?? '-'] as [string, string]] : []),
  ];
  const widths = d.kind === 'LEGACY' ? [205, 185, 215, 70, 95] : [230, 200, 240, 100];
  let x = M;
  meta.forEach(([k, v], i) => {
    const colW = widths[i];
    page.drawText(k.toUpperCase(), { x, y: H - 100, size: 7, font: bold, color: MUTED });
    page.drawText(truncate(v, bold, 9.5, colW - 10), { x, y: H - 112, size: 9.5, font: bold, color: BLACK });
    x += colW;
  });
  return page;
}

function tableTop(page: PDFPage, bold: PDFFont) {
  const top = H - 132;
  page.drawRectangle({ x: M, y: top - 6, width: W - 2 * M, height: 18, color: rgb(0.9, 0.96, 0.95) });
  let x = M;
  for (const c of COLS) {
    page.drawText(c.label, { x: x + 3, y: top, size: 8, font: bold, color: NAVY });
    x += c.w;
  }
  return top - ROW_H - 2;
}

function drawCertification(page: PDFPage, top: number, d: SigningSheetData, font: PDFFont, bold: PDFFont) {
  page.drawText('CERTIFICATION', { x: M, y: top, size: 10, font: bold, color: GREEN });
  TEXT[d.kind].certify(d).forEach((line, i) =>
    page.drawText(truncate(line, font, 8.5, W - 2 * M), { x: M, y: top - 15 - i * 12, size: 8.5, font, color: BLACK }));

  const roles = TEXT[d.kind].roles;
  const stampW = 150;
  const boxW = (W - 2 * M - stampW - 3 * 14) / 3;
  const boxTop = top - 44, boxH = 112;
  roles.forEach((role, i) => {
    const x = M + i * (boxW + 14);
    page.drawRectangle({ x, y: boxTop - boxH, width: boxW, height: boxH, borderColor: LINE, borderWidth: 0.8 });
    page.drawText(role.toUpperCase(), { x: x + 8, y: boxTop - 14, size: 7.5, font: bold, color: NAVY });
    [['Name', 38], ['Signature', 66], ['Date', 94]].forEach(([label, dy]) => {
      const yy = boxTop - (dy as number);
      page.drawText(label as string, { x: x + 8, y: yy, size: 8, font, color: MUTED });
      page.drawLine({ start: { x: x + 56, y: yy - 2 }, end: { x: x + boxW - 10, y: yy - 2 }, thickness: 0.6, color: rgb(0.6, 0.64, 0.7) });
    });
  });
  const sx = W - M - stampW;
  page.drawRectangle({ x: sx, y: boxTop - boxH, width: stampW, height: boxH, borderColor: TEAL, borderWidth: 1, borderDashArray: [4, 3] });
  const t1 = TEXT[d.kind].stamp;
  page.drawText(t1, { x: sx + (stampW - bold.widthOfTextAtSize(t1, 8)) / 2, y: boxTop - boxH / 2, size: 8, font: bold, color: TEAL });
}
