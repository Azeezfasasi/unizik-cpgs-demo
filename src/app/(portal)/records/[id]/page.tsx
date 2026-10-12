import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage, scopedDepartmentIds } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { can } from '@/lib/rbac';
import { CLASS_LABELS, type ClassOfDegree } from '@/lib/grading';
import { fmtDate, fmtDateTime, fullName, titleCase } from '@/lib/format';
import { Amendment, GraduandRecord, ResultSheet, StoredFile, Verification } from '@/models';
import { Alert, Badge, Card, DetailList, PageHeader, StatusBadge, PageSkeleton } from '@/components/ui';
import { ScanViewer } from '@/components/ScanViewer';
import { ActionForm, SubmitButton } from '@/components/forms';
import { issueDocument, revokeDocument } from '../../transcripts/actions';
import { AmendmentForm } from './AmendmentForm';

export const metadata: Metadata = { title: 'Graduand record' };

type Rec = {
  _id: Types.ObjectId; degree: string; cgpa?: number; classOfDegree?: string; thesisTitle?: string; supervisor?: string;
  senateApprovalDate?: Date; locked: boolean; version: number; origin: string; illegible: boolean; remarks?: string;
  sourceFile?: Types.ObjectId; sourcePage?: number; createdAt: Date; updatedAt: Date;
  courses: { code: string; title?: string; units?: number; score?: number; grade?: string }[];
  history: { version: number; data: Record<string, unknown>; at: Date }[];
  student: { matricNo: string; surname: string; otherNames: string; sex?: string };
  department: { _id: Types.ObjectId; name: string; faculty: { name: string } };
  programme: { name: string; degreeType: string }; session: { label: string };
  sheet: { _id: Types.ObjectId; reference: string; status: string; files: Types.ObjectId[] };
};

export default function RecordPage(props: PageProps<'/records/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecordPageContent {...props} />
    </Suspense>
  );
}

async function RecordPageContent({ params }: PageProps<'/records/[id]'>) {
  const { id } = await params;
  const user = await requirePage('record:read');
  if (!Types.ObjectId.isValid(id)) notFound();
  await db();
  const r = await GraduandRecord.findById(id)
    .populate('student', 'matricNo surname otherNames sex')
    .populate({ path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } })
    .populate('programme', 'name degreeType').populate('session', 'label')
    .populate('sheet', 'reference status files')
    .lean<Rec>();
  if (!r) notFound();
  const scope = await scopedDepartmentIds(user);
  if (scope && !scope.some((d) => d.equals(r.department._id))) notFound();

  await audit(user, 'record.view', 'GraduandRecord', id, undefined, { matricNo: r.student.matricNo });

  const canIssue = can(user.role, 'transcript:issue');
  const canAmend = can(user.role, 'amendment:request');
  const [files, verifications, amendments, sheetApprovals] = await Promise.all([
    StoredFile.find({ _id: { $in: r.sheet.files } }).lean(),
    canIssue || can(user.role, 'audit:read') ? Verification.find({ record: r._id }).sort({ createdAt: -1 }).lean() : [],
    Amendment.find({ record: r._id }).sort({ createdAt: -1 }).populate<{ requestedBy: { name: string } }>('requestedBy', 'name').lean(),
    ResultSheet.findById(r.sheet._id).select('approvals').lean(),
  ]);
  const pendingAmendment = amendments.some((a) => a.status === 'PENDING');
  const fileList = files.map((f) => ({ id: f._id.toString(), name: f.originalName ?? 'scan' }));
  const units = r.courses.reduce((a, c) => a + (c.units ?? 0), 0);

  return (
    <>
      <PageHeader
        back={{ href: '/records', label: 'Search' }}
        title={fullName(r.student)}
        description={<><span className="font-mono">{r.student.matricNo}</span> · {r.degree} · {r.session.label}</>}
        actions={<>
          {r.locked ? <Badge tone="dark">Locked · v{r.version}</Badge> : <Badge tone="warning">In progress</Badge>}
          <Badge tone={r.origin === 'ONLINE' ? 'brand' : 'neutral'}>{r.origin === 'ONLINE' ? 'Online' : 'Legacy'}</Badge>
        </>}
      />

      {!r.locked && <div className="mb-6"><Alert tone="warning">This record is not final yet. Its sheet is at <b><StatusBadge status={r.sheet.status} /></b>.</Alert></div>}
      {r.illegible && <div className="mb-6"><Alert tone="warning">Flagged illegible during indexing. Confirm against the scan before relying on it.</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Final result">
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-brand-soft p-4">
                <div className="text-xs font-semibold tracking-wide text-brand uppercase">CGPA</div>
                <div className="mt-1 text-3xl font-semibold text-navy tabular-nums">{r.cgpa?.toFixed(2) ?? '—'}</div>
              </div>
              <div className="rounded-lg bg-accent-soft p-4">
                <div className="text-xs font-semibold tracking-wide text-accent uppercase">Class</div>
                <div className="mt-1 text-xl font-semibold text-navy">{r.classOfDegree ? CLASS_LABELS[r.classOfDegree as ClassOfDegree] : '—'}</div>
              </div>
              <div className="rounded-lg bg-slate-100 p-4">
                <div className="text-xs font-semibold tracking-wide text-muted uppercase">Senate approval</div>
                <div className="mt-1 text-lg font-semibold text-navy">{fmtDate(r.senateApprovalDate)}</div>
              </div>
            </div>
            <DetailList items={[
              ['Faculty', r.department.faculty?.name],
              ['Department', r.department.name],
              ['Programme', r.programme.name],
              ['Session', r.session.label],
              ['Sex', r.student.sex],
              ['Supervisor', r.supervisor],
              ['Thesis / dissertation', r.thesisTitle],
              ['Remarks', r.remarks],
              ['Result sheet', <Link key="s" href={`/sheets/${r.sheet._id}`} className="link font-mono text-xs">{r.sheet.reference}</Link>],
              ['Source page', r.sourcePage],
            ]} />
          </Card>

          {r.courses.length > 0 && (
            <Card title={`Courses (${r.courses.length} · ${units} units)`} bodyClass="p-0">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Code</th><th>Title</th><th className="text-right">Units</th><th className="text-right">Score</th><th>Grade</th></tr></thead>
                  <tbody>
                    {r.courses.map((c, i) => (
                      <tr key={i}><td className="font-mono text-xs">{c.code}</td><td>{c.title}</td><td className="text-right">{c.units}</td><td className="text-right">{c.score ?? '—'}</td><td>{c.grade ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {canIssue && r.locked && (
            <Card title="Issue a statement of result or transcript">
              <ActionForm action={issueDocument.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="kind">Document</label>
                  <select id="kind" name="kind" className="input">
                    <option value="STATEMENT_OF_RESULT">Statement of result</option>
                    <option value="TRANSCRIPT">Academic transcript</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="validDays">Valid for</label>
                  <select id="validDays" name="validDays" defaultValue="365" className="input">
                    <option value="90">90 days</option><option value="365">1 year</option><option value="1825">5 years</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="issuedTo">Issued to</label>
                  <input id="issuedTo" name="issuedTo" required placeholder="The graduand, or e.g. Federal Ministry of Health" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="email">Email the document to <span className="font-normal text-muted">(optional)</span></label>
                  <input id="email" name="email" type="email" className="input" />
                </div>
                <div className="sm:col-span-2"><SubmitButton className="btn-accent">Generate document</SubmitButton></div>
              </ActionForm>
            </Card>
          )}

          {(verifications.length > 0) && (
            <Card title="Issued documents" bodyClass="p-0">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Code</th><th>Type</th><th>Issued to</th><th>Issued</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {verifications.map((v) => {
                      const expired = v.expiresAt < new Date();
                      return (
                        <tr key={v._id.toString()}>
                          <td className="font-mono text-xs">{v.code}</td>
                          <td>{v.kind === 'TRANSCRIPT' ? 'Transcript' : 'Statement'}</td>
                          <td>{v.issuedTo}</td>
                          <td className="text-xs">{fmtDate(v.createdAt)}</td>
                          <td>{v.revoked ? <Badge tone="danger">Revoked</Badge> : expired ? <Badge>Expired</Badge> : <Badge tone="success">Valid</Badge>}</td>
                          <td className="text-right">
                            {canIssue && !v.revoked && (
                              <div className="flex flex-col items-end gap-1">
                                <a className="text-xs link" href={`/api/documents/${v._id}`} target="_blank" rel="noreferrer">Download PDF</a>
                                <details className="text-left">
                                  <summary className="cursor-pointer text-xs text-red-700">Revoke</summary>
                                  <ActionForm action={revokeDocument.bind(null, v._id.toString())} className="mt-1 w-56 space-y-1">
                                    <input name="reason" placeholder="Reason" className="input py-1 text-xs" />
                                    <SubmitButton className="btn-danger px-2 py-1 text-xs">Confirm revoke</SubmitButton>
                                  </ActionForm>
                                </details>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {canAmend && r.locked && !pendingAmendment && (
            <Card title="Request an amendment">
              <p className="mb-4 text-sm text-muted">Locked records change only through an amendment approved by the Provost. The current version stays readable.</p>
              <AmendmentForm recordId={id} current={{
                cgpa: r.cgpa?.toString() ?? '', classOfDegree: r.classOfDegree ?? '', thesisTitle: r.thesisTitle ?? '',
                supervisor: r.supervisor ?? '', senateApprovalDate: r.senateApprovalDate ? new Date(r.senateApprovalDate).toISOString().slice(0, 10) : '',
                remarks: r.remarks ?? '',
              }} />
            </Card>
          )}

          {(amendments.length > 0 || r.history.length > 0) && (
            <Card title="Amendments and earlier versions">
              <ul className="space-y-4 text-sm">
                {amendments.map((a) => (
                  <li key={a._id.toString()} className="rounded-md border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy">Requested by {a.requestedBy?.name} · {fmtDate(a.createdAt)}</span>
                      <Badge tone={a.status === 'APPROVED' ? 'success' : a.status === 'REJECTED' ? 'danger' : 'warning'}>{titleCase(a.status)}</Badge>
                    </div>
                    <ul className="mt-2 text-xs">{a.changes.map((c, i) => <li key={i}><b>{c.field}</b>: {String(c.from ?? '—')} → {String(c.to ?? '—')}</li>)}</ul>
                    <p className="mt-1 text-xs text-muted">{a.reason}</p>
                  </li>
                ))}
                {r.history.map((h) => (
                  <li key={h.version} className="rounded-md bg-slate-50 p-3 text-xs">
                    <div className="font-medium text-navy">Version {h.version} (replaced {fmtDateTime(h.at)})</div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      {Object.entries(h.data).map(([k, v]) => <div key={k}><span className="text-muted">{k}:</span> {String(v ?? '—')}</div>)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card title="Source scan">
            <ScanViewer files={fileList} initial={r.sourceFile?.toString()} />
          </Card>
          <Card title="Approval history">
            <ol className="space-y-2 text-sm">
              {(sheetApprovals?.approvals ?? []).map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span><b className="text-navy">{a.action === 'RETURN' ? 'Returned' : a.action === 'LOCK' ? 'Locked' : a.action === 'SUBMIT' ? 'Submitted' : 'Approved'}</b> · {a.stage} · {a.byName}</span>
                  <span className="text-xs whitespace-nowrap text-muted">{fmtDate(a.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
          <p className="text-xs text-muted">Record created {fmtDateTime(r.createdAt)} · last changed {fmtDateTime(r.updatedAt)}</p>
        </div>
      </div>
    </>
  );
}
