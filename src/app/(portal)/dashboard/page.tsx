import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireUser, scopeFilter } from '@/lib/auth';
import { inboxCounts } from '@/lib/nav';
import { can, ROLE_LABELS } from '@/lib/rbac';
import { FLOW, STATUS_LABELS, type FlowStage } from '@/lib/workflow';
import { daysSince } from '@/lib/format';
import type { Types } from 'mongoose';
import { CLASS_LABELS, CLASS_OF_DEGREE, type ClassOfDegree } from '@/lib/grading';
import { AcademicSession, Department, DigitizationBatch, GraduandRecord, ResultSheet } from '@/models';
import { Alert, Card, PageHeader, StatCard, PageSkeleton } from '@/components/ui';
import { BarList } from '@/components/BarList';
import { ColumnChart, DonutChart } from '@/components/charts';

const CLASS_COLORS: Record<ClassOfDegree, string> = {
  DISTINCTION: '#007a55', CREDIT: '#009689', MERIT: '#5eead4', PASS: '#94a3b8', FAIL: '#dc2626', NOT_APPLICABLE: '#475569',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Sessions shown in "Graduands by session"; legacy records can span decades. */
const RECENT_SESSIONS = 12;

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

  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));
  const [records, locked, legacy, online, bySession, sheetStatus, batches, byMonth, byClass, byDept] = await Promise.all([
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
    GraduandRecord.aggregate<{ _id: { y: number; m: number; origin: string }; n: number }>([
      { $match: { ...scope, createdAt: { $gte: since } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, origin: '$origin' }, n: { $sum: 1 } } },
    ]),
    GraduandRecord.aggregate<{ _id: string | null; n: number }>([
      { $match: scope },
      { $group: { _id: '$classOfDegree', n: { $sum: 1 } } },
    ]),
    GraduandRecord.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: scope },
      { $group: { _id: '$department', n: { $sum: 1 } } },
    ]),
  ]);

  // Last 12 months, oldest first, legacy and online stacked.
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1)));
  const monthly = months.map((d) => {
    const n = (origin: string) => byMonth.find((r) => r._id.y === d.getUTCFullYear() && r._id.m === d.getUTCMonth() + 1 && r._id.origin === origin)?.n ?? 0;
    return { label: MONTHS[d.getUTCMonth()] +(d.getUTCMonth() === 0 || d === months[0] ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''), values: [n('LEGACY'), n('ONLINE')] };
  });

  const classParts = [...CLASS_OF_DEGREE, null].map((c) => ({
    name: c ? CLASS_LABELS[c] : 'Not recorded',
    value: byClass.filter((r) => (r._id ?? null) === c).reduce((a, r) => a + r.n, 0),
    color: c ? CLASS_COLORS[c] : '#cbd5e1',
  })).filter((p) => p.value > 0 || (p.name !== 'Not recorded' && p.name !== 'Not applicable'));

  // University-wide or faculty staff see faculties; staff limited to departments see their departments.
  const depts = await Department.find({ _id: { $in: byDept.map((r) => r._id) } }).populate<{ faculty: { name: string } }>('faculty', 'name').lean();
  const byFaculty = !Object.keys(scope).length;
  const groupRows = new Map<string, number>();
  for (const r of byDept) {
    const d = depts.find((x) => x._id.equals(r._id));
    const key = (byFaculty ? d?.faculty?.name : d?.name) ?? 'Unknown';
    groupRows.set(key, (groupRows.get(key) ?? 0) + r.n);
  }
  const groupBars = [...groupRows].map(([name, value]) => ({ label: name.replace(/^Faculty of /i, ''), title: name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 10);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Records added, last 12 months" className="lg:col-span-2">
          <ColumnChart data={monthly} unit="records" series={[{ name: 'Legacy (digitized)', color: '#0f172a' }, { name: 'Online submissions', color: '#009689' }]} />
        </Card>

        <Card title="Class of degree">
          {records ? <DonutChart parts={classParts} unit="graduands" /> : <p className="text-sm text-muted">No records yet.</p>}
        </Card>

        <Card title={byFaculty ? 'Records by faculty' : 'Records by department'}>
          {groupBars.length ? <BarList rows={groupBars} unit="records" wide /> : <p className="text-sm text-muted">No records yet.</p>}
          {groupRows.size > 10 && <p className="mt-3 text-xs text-muted">Top 10 of {groupRows.size} shown.</p>}
        </Card>

        <Card title="Graduands by session">
          {sessionRows.length ? <BarList rows={sessionRows.slice(-RECENT_SESSIONS)} unit="graduands" /> : <p className="text-sm text-muted">No records yet.</p>}
          {sessionRows.length > RECENT_SESSIONS && (
            <p className="mt-3 text-xs text-muted">Latest {RECENT_SESSIONS} of {sessionRows.length} sessions shown. <Link href="/records" className="link">Search records</Link> for earlier ones.</p>
          )}
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
