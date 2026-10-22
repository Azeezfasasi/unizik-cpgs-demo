import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage, scopedDepartmentIds } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { recordFilter, findRecords, type RecordRow, type SearchParams } from '@/lib/search';
import { CLASS_LABELS, CLASS_OF_DEGREE } from '@/lib/grading';
import { fmtDate, fullName } from '@/lib/format';
import { audit } from '@/lib/audit';
import { AcademicSession, Department, Faculty, GraduandRecord, Programme } from '@/models';
import { Badge, Card, ClassBadge, EmptyState, PageHeader, Pagination, PageSkeleton } from '@/components/ui';

export const metadata: Metadata = { title: 'Search records' };

const PAGE_SIZE = 25;

export default function RecordsPage(props: PageProps<'/records'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecordsPageContent {...props} />
    </Suspense>
  );
}

async function RecordsPageContent({ searchParams }: PageProps<'/records'>) {
  const user = await requirePage('record:read');
  const sp = (await searchParams) as SearchParams;
  await db();

  const scopeIds = await scopedDepartmentIds(user);
  const deptFilter = scopeIds ? { _id: { $in: scopeIds } } : {};
  const [faculties, departments, programmes, sessions] = await Promise.all([
    scopeIds ? [] : Faculty.find().sort({ name: 1 }).lean(),
    Department.find(deptFilter).sort({ name: 1 }).lean(),
    Programme.find(scopeIds ? { department: { $in: scopeIds } } : {}).sort({ name: 1 }).lean(),
    AcademicSession.find().sort({ startYear: -1 }).lean(),
  ]);

  const searched = Object.entries(sp).some(([k, v]) => k !== 'page' && v);
  const filter = await recordFilter(user, sp);
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1);
  const [total, rows] = await Promise.all([
    GraduandRecord.countDocuments(filter),
    findRecords(filter).sort({ updatedAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean<RecordRow[]>(),
  ]);
  if (searched) await audit(user, 'record.search', 'GraduandRecord', undefined, undefined, { ...sp, results: total });

  const qs = (extra: Record<string, string | number>) =>
    '?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();

  return (
    <>
      <PageHeader
        title="Search graduand records"
        description="Search by matric number, name or thesis title. Every search and record view is recorded."
        actions={can(user.role, 'record:export') && total > 0
          ? <a className="btn-outline" href={`/api/reports/export${qs({})}`}>Export CSV ({total.toLocaleString()})</a> : null}
      />

      <form className="card mb-6 p-4" role="search">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={sp.q} className="input text-base" placeholder="Matric number, surname, other names or thesis title" aria-label="Search" autoFocus />
          <button className="btn-primary px-6">Search</button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {!scopeIds && (
            <select name="faculty" defaultValue={sp.faculty ?? ''} className="input" aria-label="Faculty">
              <option value="">All faculties</option>
              {faculties.map((f) => <option key={f._id.toString()} value={f._id.toString()}>{f.name}</option>)}
            </select>
          )}
          <select name="department" defaultValue={sp.department ?? ''} className="input" aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d._id.toString()} value={d._id.toString()}>{d.name}</option>)}
          </select>
          <select name="programme" defaultValue={sp.programme ?? ''} className="input" aria-label="Programme">
            <option value="">All programmes</option>
            {programmes.map((p) => <option key={p._id.toString()} value={p._id.toString()}>{p.name}</option>)}
          </select>
          <select name="session" defaultValue={sp.session ?? ''} className="input" aria-label="Session">
            <option value="">All sessions</option>
            {sessions.map((s) => <option key={s._id.toString()} value={s._id.toString()}>{s.label}</option>)}
          </select>
          <select name="cls" defaultValue={sp.cls ?? ''} className="input" aria-label="Class of degree">
            <option value="">Any class</option>
            {CLASS_OF_DEGREE.map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
          </select>
          <select name="origin" defaultValue={sp.origin ?? ''} className="input" aria-label="Origin">
            <option value="">Legacy and online</option><option value="LEGACY">Legacy only</option><option value="ONLINE">Online only</option>
          </select>
          <select name="locked" defaultValue={sp.locked ?? ''} className="input" aria-label="Status">
            <option value="">Any status</option><option value="1">Locked (final)</option><option value="0">In progress</option>
          </select>
        </div>
        {searched && <Link href="/records" className="mt-3 inline-block text-xs link">Clear filters</Link>}
      </form>

      <Card title={`${total.toLocaleString()} record${total === 1 ? '' : 's'}`} bodyClass="p-0">
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Matric no</th><th>Name</th><th>Degree</th><th>Session</th><th className="text-right">CGPA</th><th>Class</th><th>Board</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id.toString()} className="hover:bg-slate-50">
                      <td><Link href={`/records/${r._id}`} className="link font-mono text-xs">{r.student.matricNo}</Link></td>
                      <td>{fullName(r.student)}</td>
                      <td>
                        {r.degree}
                        <div className="text-xs text-muted">{r.department.name}</div>
                      </td>
                      <td>{r.session.label}</td>
                      <td className="text-right tabular-nums">{r.cgpa?.toFixed(2) ?? '—'}</td>
                      <td><ClassBadge cls={r.classOfDegree} /></td>
                      <td className="text-xs whitespace-nowrap">{fmtDate(r.senateApprovalDate)}</td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          {r.locked ? <Badge tone="dark">Locked</Badge> : <Badge tone="warning">In progress</Badge>}
                          <Badge tone={r.origin === 'ONLINE' ? 'brand' : 'neutral'}>{r.origin === 'ONLINE' ? 'Online' : 'Legacy'}</Badge>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(p) => `/records${qs({ page: p })}`} />
          </>
        ) : <EmptyState title={searched ? 'No records match your search' : 'No records yet'}>Try a shorter name or the full matric number.</EmptyState>}
      </Card>
    </>
  );
}
