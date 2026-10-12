import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireUser, scopeFilter } from '@/lib/auth';
import { inboxCounts } from '@/lib/nav';
import { can, ROLE_LABELS } from '@/lib/rbac';
import { FLOW, STATUS_LABELS, type FlowStage } from '@/lib/workflow';
import { daysSince } from '@/lib/format';
import { AcademicSession, DigitizationBatch, GraduandRecord, ResultSheet } from '@/models';
import { Alert, Card, PageHeader, StatCard, PageSkeleton } from '@/components/ui';
import { BarList } from '@/components/BarList';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Dashboard(props: PageProps<'/dashboard'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent {...props} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: PageProps<'/dashboard'>) {
  const user = await requireUser();
  const { denied } = await searchParams;
  await db();
  const scope = await scopeFilter(user);
  const counts = await inboxCounts(user);

  const [records, locked, legacy, online, bySession, sheetStatus, batches] = await Promise.all([
    GraduandRecord.countDocuments(scope),
    GraduandRecord.countDocuments({ ...scope, locked: true }),
    GraduandRecord.countDocuments({ ...scope, origin: 'LEGACY' }),
    GraduandRecord.countDocuments({ ...scope, origin: 'ONLINE' }),
    GraduandRecord.aggregate<{ _id: string; n: number }>([
      { $match: scope },
      { $group: { _id: '$session', n: { $sum: 1 } } },
    ]),
    ResultSheet.aggregate<{ _id: { origin: string; status: string }; n: number; oldest: Date }>([
      { $match: scope },
      { $group: { _id: { origin: '$origin', status: '$status' }, n: { $sum: 1 }, oldest: { $min: '$statusSince' } } },
    ]),
    DigitizationBatch.aggregate<{ _id: string; n: number }>([
      { $match: scope },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);

  const sessions = await AcademicSession.find({ _id: { $in: bySession.map((s) => s._id) } }).lean();
  const sessionRows = bySession
    .map((s) => ({ label: sessions.find((x) => x._id.equals(s._id))?.label ?? '—', value: s.n }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const sheetCount = (origin: string, status: string) =>
    sheetStatus.filter((s) => s._id.origin === origin && s._id.status === status).reduce((a, s) => a + s.n, 0);
  const legacySheets = sheetStatus.filter((s) => s._id.origin === 'LEGACY').reduce((a, s) => a + s.n, 0);
  const pipeline = [
    { label: 'Being indexed', value: sheetCount('LEGACY', 'DRAFT') + sheetCount('LEGACY', 'RETURNED') },
    { label: 'Awaiting QA', value: sheetCount('LEGACY', 'INDEXED') },
    { label: 'QA passed', value: sheetCount('LEGACY', 'QA_PASSED') },
    { label: 'Locked', value: sheetCount('LEGACY', 'LOCKED') },
  ];
  const boxes = batches.reduce((a, b) => a + b.n, 0);

  const stuck = (Object.keys(FLOW) as FlowStage[]).map((st) => {
    const row = sheetStatus.find((s) => s._id.origin === 'ONLINE' && s._id.status === st);
    const days = daysSince(row?.oldest);
    return { stage: st, n: row?.n ?? 0, days };
  });

  const showDigitization = can(user.role, 'digitization:view') || can(user.role, 'record:read:all');
  const showPipeline = can(user.role, 'submission:approve') || can(user.role, 'record:read:all') || user.role === 'DEPT_OFFICER';

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description={`${ROLE_LABELS[user.role]}${Object.keys(scope).length ? ' · showing your department or faculty only' : ' · university-wide view'}`}
        actions={
          <>
            {can(user.role, 'record:read') && <Link href="/records" className="btn-outline">Search records</Link>}
            {user.role === 'DEPT_OFFICER' && <Link href="/submissions/new" className="btn-primary">New submission</Link>}
            {can(user.role, 'batch:assign') && <Link href="/digitization" className="btn-primary">Manage batches</Link>}
          </>
        }
      />

      {denied && <div className="mb-6"><Alert tone="warning">You do not have access to that page.</Alert></div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can(user.role, 'submission:approve') && (
          <StatCard label="Awaiting your approval" value={counts.approvals} tone="brand" href="/approvals" hint="Sheets at your stage" />
        )}
        {can(user.role, 'legacy:qa') && <StatCard label="QA queue" value={counts.qa} tone="brand" href="/digitization/qa" hint="Indexed sheets to check" />}
        {can(user.role, 'record:lock') && <StatCard label="Ready to lock" value={counts.toLock} tone="accent" href="/digitization?status=QA_PASSED" hint="QA-passed legacy sheets" />}
        {can(user.role, 'amendment:approve') && <StatCard label="Amendments pending" value={counts.amendments} tone="navy" href="/amendments" />}
        {user.role === 'DEPT_OFFICER' && <StatCard label="Returned to you" value={counts.returned} tone={counts.returned ? 'danger' : 'brand'} href="/submissions" hint="Need correction" />}
        <StatCard label="Graduand records" value={records.toLocaleString()} tone="navy" hint={`${legacy.toLocaleString()} legacy · ${online.toLocaleString()} online`} />
        <StatCard label="Locked (archived)" value={locked.toLocaleString()} tone="accent" hint={records ? `${Math.round((locked / records) * 100)}% of all records` : 'No records yet'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Graduands by session">
          {sessionRows.length ? <BarList rows={sessionRows} unit="graduands" /> : <p className="text-sm text-muted">No records yet.</p>}
        </Card>

        {showDigitization && (
          <Card title="Legacy digitization progress" actions={<Link href="/digitization" className="text-xs link">Open</Link>}>
            <p className="mb-4 text-sm text-muted">{boxes} boxes inventoried · {legacySheets} sheets created</p>
            <BarList rows={pipeline} unit="sheets" max={Math.max(legacySheets, 1)} />
          </Card>
        )}

        {showPipeline && (
          <Card title="Online submissions by stage" className="lg:col-span-2" bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Stage</th><th>Held by</th><th className="text-right">Sheets</th><th className="text-right">Oldest waiting</th></tr></thead>
                <tbody>
                  {stuck.map((s) => (
                    <tr key={s.stage}>
                      <td className="font-medium text-navy">{STATUS_LABELS[s.stage]}</td>
                      <td className="text-muted">{ROLE_LABELS[FLOW[s.stage].role]}</td>
                      <td className="text-right tabular-nums">{s.n}</td>
                      <td className="text-right tabular-nums">
                        {s.n ? <span className={s.days > 7 ? 'font-semibold text-red-700' : ''}>{s.days} day{s.days === 1 ? '' : 's'}{s.days > 7 ? ' ⚠' : ''}</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
