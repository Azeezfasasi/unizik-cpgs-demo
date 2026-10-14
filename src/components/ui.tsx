import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS_LABELS } from '@/lib/workflow';
import { CLASS_LABELS, type ClassOfDegree } from '@/lib/grading';

export function PageHeader({ title, description, actions, back }: {
  title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-2 inline-block text-sm text-muted hover:text-brand">← {back.label}</Link>}
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-soft text-brand ring-brand/20',
  success: 'bg-accent-soft text-accent ring-accent/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  dark: 'bg-navy text-white ring-navy',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', RETURNED: 'danger', SENATE_APPROVED: 'success', LOCKED: 'dark',
  QA_PASSED: 'success', INDEXED: 'warning',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'brand'}>{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</Badge>;
}

export function ClassBadge({ cls }: { cls?: string | null }) {
  if (!cls) return <span className="text-muted">—</span>;
  const tone: Tone = cls === 'DISTINCTION' ? 'success' : cls === 'FAIL' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{CLASS_LABELS[cls as ClassOfDegree] ?? cls}</Badge>;
}

export function StatCard({ label, value, hint, tone = 'brand', href, className = '' }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'brand' | 'accent' | 'navy' | 'danger'; href?: string;
  /** Extra classes for the grid item, e.g. a column span. */
  className?: string;
}) {
  const bar = { brand: 'bg-brand', accent: 'bg-accent', navy: 'bg-navy', danger: 'bg-red-600' }[tone];
  const body = (
    <div className={`card relative h-full overflow-hidden p-4 transition-shadow hover:shadow-md sm:p-5 ${href ? '' : className}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-navy tabular-nums sm:mt-2 sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className={className}>{body}</Link> : body;
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-5' }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    // min-w-0: inside a grid, let the card shrink so wide tables scroll within it instead of widening the page.
    <section className={`card min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><path d="M4 3h9l3 3v11H4V3Zm2 4v2h8V7H6Zm0 4v2h8v-2H6Z" /></svg>
      </div>
      <p className="font-medium text-navy">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'brand', children }: { tone?: 'brand' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const cls = {
    brand: 'border-brand/30 bg-brand-soft text-navy',
    success: 'border-accent/30 bg-accent-soft text-accent',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-800',
  }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
      <span className="text-muted">Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-outline py-1.5" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-outline py-1.5" href={href(page + 1)}>Next</Link>}
      </div>
    </nav>
  );
}

export function DetailList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">{k}</dt>
          <dd className="mt-1 text-sm text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Steps({ steps, current, returned }: { steps: { status: string; label: string }[]; current: string; returned?: boolean }) {
  const idx = steps.findIndex((s) => s.status === current);
  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-xs">
      {steps.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s.status} className="flex items-center">
            <span className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium ${
              returned && i === 0 ? 'bg-red-50 text-red-700' :
              done ? (i === idx ? 'bg-brand text-white' : 'bg-accent-soft text-accent') : 'bg-slate-100 text-slate-500'}`}>
              {done && i < idx ? '✓ ' : ''}{s.label}
            </span>
            {i < steps.length - 1 && <span className={`mx-1 h-px w-4 ${i < idx ? 'bg-accent' : 'bg-slate-300'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-64 rounded bg-slate-200" />
      <div className="mb-8 h-4 w-96 max-w-full rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-slate-200" />)}
      </div>
      <div className="mt-6 h-72 rounded-lg bg-slate-200" />
    </div>
  );
}
