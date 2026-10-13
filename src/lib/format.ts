export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const fmtDate = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtBytes = (n?: number | null) =>
  n == null ? '—' : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const fullName = (s?: { surname?: string | null; otherNames?: string | null } | null) =>
  s ? `${(s.surname ?? '').toUpperCase()}, ${s.otherNames ?? ''}` : '—';

/** Whole days elapsed since a date (0 when missing). */
export const daysSince = (d?: Date | string | null) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : 0;

export const minutesSince = (d?: Date | string | null) =>
  d ? (Date.now() - new Date(d).getTime()) / 60_000 : Infinity;

export type BoardFields = {
  semesterGpas?: number[] | null; projectGrade?: number | null; effectiveDate?: Date | string | null; boardMeeting?: string | null;
};

/** PG Board result list details of a record as label/value pairs, leaving out what was not recorded. */
export function boardDetails(r: BoardFields): [string, string][] {
  const out: [string, string][] = [];
  if (r.semesterGpas?.length) out.push(['Semester GPAs', r.semesterGpas.map((g) => g.toFixed(2)).join(' / ')]);
  if (r.projectGrade != null) out.push(['Project', r.projectGrade.toFixed(2)]);
  if (r.effectiveDate) out.push(['Effective date of graduation', fmtDate(r.effectiveDate)]);
  if (r.boardMeeting) out.push(['PG Board meeting', r.boardMeeting]);
  return out;
}

/** One-line form of the PG Board details for tables, e.g. "Sem 3.90 / 4.45 · Proj 5.00 · WEF 13/03/2014 · 63rd Board". */
export function boardLine(r: BoardFields) {
  const dmy = (d: Date | string) => new Date(d).toISOString().slice(0, 10).split('-').reverse().join('/');
  return [
    r.semesterGpas?.length ? `Sem ${r.semesterGpas.map((g) => g.toFixed(2)).join(' / ')}` : '',
    r.projectGrade != null ? `Proj ${r.projectGrade.toFixed(2)}` : '',
    r.effectiveDate ? `WEF ${dmy(r.effectiveDate)}` : '',
    r.boardMeeting ? `${r.boardMeeting} Board` : '',
  ].filter(Boolean).join('  ·  ');
}
