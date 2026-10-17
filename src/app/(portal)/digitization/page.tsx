import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listSheets } from '@/lib/queries';
import { titleCase } from '@/lib/format';
import { boxDepartmentLabel } from '@/lib/boxes';
import { AcademicSession, Department, DigitizationBatch, ResultSheet } from '@/models';
import { Badge, Card, EmptyState, PageHeader, StatCard, PageSkeleton } from '@/components/ui';
import { BulkSheetForm } from '@/components/BulkSheetForm';
import { bulkLockSheets } from '../sheets/actions';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createBatch } from './actions';

export const metadata: Metadata = { title: 'Legacy digitization' };

type BatchRow = {
  _id: { toString(): string }; boxCode: string; status: string; condition: string; priority: number;
  estimatedSheets: number; sessions: { label: string }[];
  department?: { _id: Types.ObjectId; name: string; code: string }; departments?: { _id: Types.ObjectId; name: string; code: string }[]; allDepartments?: boolean;
  indexer?: { name: string }; reviewer?: { name: string };
};

export default function DigitizationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DigitizationPageContent />
    </Suspense>
  );
}

async function DigitizationPageContent() {
  const user = await requirePage('digitization:view');
  await db();

  const batchFilter: Record<string, unknown> = {};
  if (user.role === 'INDEXER') batchFilter.indexer = user.id;
  if (user.role === 'QA_REVIEWER') batchFilter.reviewer = user.id;

  const [batches, departments, sessions, sheetStats, toLock] = await Promise.all([
    DigitizationBatch.find(batchFilter).sort({ priority: 1, boxCode: 1 })
      .populate('department', 'name code').populate('departments', 'name code').populate('sessions', 'label')
      .populate('indexer', 'name').populate('reviewer', 'name').lean<BatchRow[]>(),
    Department.find().sort({ name: 1 }).lean(),
    AcademicSession.find().sort({ startYear: -1 }).lean(),
    ResultSheet.aggregate<{ _id: { batch: unknown; status: string }; n: number; recs: number }>([
      { $match: { origin: 'LEGACY' } },
      { $group: { _id: { batch: '$batch', status: '$status' }, n: { $sum: 1 }, recs: { $sum: '$recordCount' } } },
    ]),
    can(user.role, 'record:lock') ? listSheets({ origin: 'LEGACY', status: 'QA_PASSED' }) : Promise.resolve([]),
  ]);

  const statFor = (batchId: string, statuses: string[]) => sheetStats
    .filter((s) => String(s._id.batch) === batchId && statuses.includes(s._id.status))
    .reduce((a, s) => ({ n: a.n + s.n, recs: a.recs + s.recs }), { n: 0, recs: 0 });
  const total = (st: string[]) => sheetStats.filter((s) => st.includes(s._id.status)).reduce((a, s) => a + s.n, 0);
  const qaReturned = await ResultSheet.countDocuments({ origin: 'LEGACY', approvals: { $elemMatch: { stage: 'QA', action: 'RETURN' } } });
  const qaTotal = await ResultSheet.countDocuments({ origin: 'LEGACY', 'approvals.stage': 'QA' });

  return (
    <>
      <PageHeader
        title="Legacy results digitization"
        description="Each physical box of result files is a batch. Sheets are scanned, indexed, checked by a second officer and locked by Records."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Boxes" value={batches.length} tone="navy" />
        <StatCard label="Being indexed" value={total(['DRAFT', 'RETURNED'])} tone="brand" />
        <StatCard label="Awaiting QA" value={total(['INDEXED'])} tone="brand" href="/digitization/qa" />
        <StatCard label="Locked" value={total(['LOCKED'])} tone="accent" />
        <StatCard label="QA return rate" value={qaTotal ? `${Math.round((qaReturned / qaTotal) * 100)}%` : '—'} tone="danger" hint="Sheets returned at least once" className="col-span-2 lg:col-span-1" />
      </div>

      {toLock.length > 0 && (
        <Card title={`Ready to verify and lock (${toLock.length})`} className="mt-6" bodyClass="p-0">
          <BulkSheetForm rows={toLock} empty=""
            action={bulkLockSheets} submitLabel="Lock selected" pendingText="Locking…"
            option={{ name: 'acceptIllegible', label: 'Also lock sheets that have rows flagged illegible (otherwise they are skipped)' }} />
        </Card>
      )}

      <div className={`mt-6 grid gap-6 ${can(user.role, 'batch:assign') ? 'xl:grid-cols-[1fr_22rem]' : ''}`}>
        <Card title="Boxes" bodyClass="p-0">
          {batches.length ? (
            <>
            {/* Phones: one card per box. */}
            <ul className="divide-y divide-line md:hidden">
              {batches.map((b) => {
                const id = b._id.toString();
                const all = statFor(id, ['DRAFT', 'RETURNED', 'INDEXED', 'QA_PASSED', 'LOCKED']);
                const locked = statFor(id, ['LOCKED']);
                const pct = b.estimatedSheets ? Math.min(100, Math.round((locked.n / b.estimatedSheets) * 100)) : 0;
                return (
                  <li key={id}>
                    <Link href={`/digitization/batches/${id}`} className="block space-y-2 px-4 py-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold whitespace-nowrap text-brand">{b.boxCode}</div>
                          <div className="truncate text-sm text-navy">{boxDepartmentLabel(b)}</div>
                        </div>
                        <Badge tone={b.status === 'COMPLETED' ? 'success' : b.status === 'IN_PROGRESS' ? 'brand' : 'neutral'}>{titleCase(b.status)}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                        <Badge tone="neutral">P{b.priority}</Badge>
                        {(b.condition === 'DAMAGED' || b.condition === 'SEVERELY_DAMAGED') && <Badge tone="danger">{titleCase(b.condition)}</Badge>}
                        <span>{b.sessions.map((s) => s.label).join(', ')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted">Indexer</span><div className="truncate">{b.indexer?.name ?? <span className="text-amber-700">Unassigned</span>}</div></div>
                        <div><span className="text-muted">QA</span><div className="truncate">{b.reviewer?.name ?? <span className="text-amber-700">Unassigned</span>}</div></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs tabular-nums">
                          <span>{locked.n}/{b.estimatedSheets || '?'} sheets locked</span><span className="text-muted">{all.recs} records</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead><tr><th>Box</th><th>Department</th><th>Sessions</th><th>Team</th><th className="text-right">Progress</th><th>Status</th></tr></thead>
                <tbody>
                  {batches.map((b) => {
                    const id = b._id.toString();
                    const all = statFor(id, ['DRAFT', 'RETURNED', 'INDEXED', 'QA_PASSED', 'LOCKED']);
                    const locked = statFor(id, ['LOCKED']);
                    const pct = b.estimatedSheets ? Math.min(100, Math.round((locked.n / b.estimatedSheets) * 100)) : 0;
                    return (
                      <tr key={id} className="hover:bg-slate-50">
                        <td>
                          <Link href={`/digitization/batches/${id}`} className="link font-mono whitespace-nowrap">{b.boxCode}</Link>
                          <div className="mt-1 flex gap-1">
                            <Badge tone="neutral">P{b.priority}</Badge>
                            {(b.condition === 'DAMAGED' || b.condition === 'SEVERELY_DAMAGED') && <Badge tone="danger">{titleCase(b.condition)}</Badge>}
                          </div>
                        </td>
                        <td>{boxDepartmentLabel(b)}</td>
                        <td className="text-xs">{b.sessions.map((s) => s.label).join(', ')}</td>
                        <td className="text-xs">
                          <div>Indexer: {b.indexer?.name ?? <span className="text-amber-700">unassigned</span>}</div>
                          <div>QA: {b.reviewer?.name ?? <span className="text-amber-700">unassigned</span>}</div>
                        </td>
                        <td className="text-right text-xs">
                          <div className="tabular-nums">{locked.n}/{b.estimatedSheets || '?'} locked · {all.recs} records</div>
                          <div className="mt-1 ml-auto h-1.5 w-28 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
                        </td>
                        <td><Badge tone={b.status === 'COMPLETED' ? 'success' : b.status === 'IN_PROGRESS' ? 'brand' : 'neutral'}>{titleCase(b.status)}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : <EmptyState title="No boxes yet">{can(user.role, 'batch:assign') ? 'Inventory the first box using the form.' : 'No boxes are assigned to you.'}</EmptyState>}
        </Card>

        {can(user.role, 'batch:assign') && (
          <Card title="Inventory a box">
            <ActionForm action={createBatch} className="space-y-3">
              <div>
                <label className="label" htmlFor="boxCode">Box code</label>
                <input id="boxCode" name="boxCode" required placeholder="CRR-BOX-0001" className="input font-mono uppercase" />
              </div>
              <fieldset className="space-y-2">
                <legend className="label">Departments in the box</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="allDepartments" className="mt-1 accent-brand" />
                  <span>All departments <span className="text-muted">(e.g. PG Board result lists that cover many departments)</span></span>
                </label>
                <select id="departments" name="departments" multiple aria-label="Departments in the box" className="input h-36">
                  {departments.map((d) => <option key={d._id.toString()} value={d._id.toString()}>{d.name}</option>)}
                </select>
                <p className="text-xs text-muted">Otherwise pick one or more. Hold Ctrl (or ⌘) to pick several; on a phone, tap each department.</p>
              </fieldset>
              <div>
                <label className="label" htmlFor="sessions">Sessions in the box</label>
                <select id="sessions" name="sessions" multiple required className="input h-36 sm:h-28">
                  {sessions.map((s) => <option key={s._id.toString()} value={s._id.toString()}>{s.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">Hold Ctrl (or ⌘) to pick several. On a phone, tap each session.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="estimatedSheets">Est. sheets</label>
                  <input id="estimatedSheets" name="estimatedSheets" type="number" min="0" defaultValue={0} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="priority">Priority</label>
                  <select id="priority" name="priority" defaultValue="3" className="input">
                    <option value="1">1 · urgent</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 · low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="condition">Physical condition</label>
                <select id="condition" name="condition" defaultValue="FAIR" className="input">
                  <option value="GOOD">Good</option><option value="FAIR">Fair</option>
                  <option value="DAMAGED">Damaged (pests or damp)</option><option value="SEVERELY_DAMAGED">Severely damaged</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="location">Storage location</label>
                <input id="location" name="location" placeholder="Sealed store, shelf B3" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows={2} className="input" />
              </div>
              <SubmitButton className="btn-primary w-full">Create box</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
