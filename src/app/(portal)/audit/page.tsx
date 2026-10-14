import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { AuditLog } from '@/models';
import { Card, EmptyState, PageHeader, Pagination, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { checkChain } from './actions';

export const metadata: Metadata = { title: 'Audit log' };
const PAGE = 50;

export default function AuditPage(props: PageProps<'/audit'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditPageContent {...props} />
    </Suspense>
  );
}

async function AuditPageContent({ searchParams }: PageProps<'/audit'>) {
  await requirePage('audit:read');
  const sp = (await searchParams) as Record<string, string | undefined>;
  await db();

  const filter: Record<string, unknown> = {};
  if (sp.action) filter.action = { $regex: `^${sp.action.replace(/[^\w.]/g, '')}` };
  if (sp.actor) filter.actorName = { $regex: sp.actor.replace(/[^\w\s.-]/g, ''), $options: 'i' };
  if (sp.entity) filter.entityId = sp.entity.trim();
  if (sp.from || sp.to) {
    filter.at = {
      ...(sp.from ? { $gte: new Date(sp.from) } : {}),
      ...(sp.to ? { $lte: new Date(`${sp.to}T23:59:59`) } : {}),
    };
  }
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1);
  const [total, rows, actions] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ seq: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    AuditLog.distinct('action'),
  ]);
  const qs = (p: number) => '?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only, hash-chained record of every sign-in, view, download and change. Each entry's hash covers the previous one, so any alteration or deletion breaks the chain."
        actions={
          <ActionForm action={checkChain} className="flex flex-col items-end">
            <SubmitButton className="btn-dark" pendingText="Verifying…">Verify chain integrity</SubmitButton>
          </ActionForm>
        }
      />

      <form className="card mb-6 grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <select name="action" defaultValue={sp.action ?? ''} className="input" aria-label="Action">
          <option value="">All actions</option>
          {[...new Set(actions.map((a: string) => a.split('.')[0]))].sort().map((p) => <option key={p} value={`${p}.`}>{p}.*</option>)}
          {actions.sort().map((a: string) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input name="actor" defaultValue={sp.actor} placeholder="Actor name" className="input" />
        <input name="entity" defaultValue={sp.entity} placeholder="Entity id" className="input font-mono text-xs" />
        <input name="from" type="date" defaultValue={sp.from} className="input" aria-label="From" />
        <input name="to" type="date" defaultValue={sp.to} className="input" aria-label="To" />
        <button className="btn-primary">Filter</button>
      </form>

      <Card title={`${total.toLocaleString()} entries`} bodyClass="p-0">
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Change</th><th>IP</th><th>Hash</th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.seq}>
                      <td className="font-mono text-xs text-muted">{e.seq}</td>
                      <td className="text-xs whitespace-nowrap">{fmtDateTime(e.at)}</td>
                      <td className="text-sm">{e.actorName ?? <span className="text-muted">anonymous</span>}</td>
                      <td><span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs text-brand">{e.action}</span></td>
                      <td className="text-xs">{e.entity}<div className="font-mono text-muted">{e.entityId}</div></td>
                      <td className="max-w-xs text-xs">
                        {e.before != null && <div className="truncate text-red-700" title={JSON.stringify(e.before)}>− {JSON.stringify(e.before)}</div>}
                        {e.after != null && <div className="truncate text-accent" title={JSON.stringify(e.after)}>+ {JSON.stringify(e.after)}</div>}
                      </td>
                      <td className="font-mono text-xs text-muted">{e.ip ?? '—'}</td>
                      <td className="font-mono text-xs text-muted" title={e.hash}>{e.hash.slice(0, 10)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={Math.ceil(total / PAGE)} href={qs} />
          </>
        ) : <EmptyState title="No entries match" />}
      </Card>
    </>
  );
}
