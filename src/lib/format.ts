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
