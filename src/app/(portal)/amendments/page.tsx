import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { fmtDate, fullName, titleCase } from '@/lib/format';
import { courseTotals, GRADE_POINTS, semesterGroups, type Letter } from '@/lib/grading';
import { Amendment } from '@/models';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ScanViewer } from '@/components/ScanViewer';
import { decideAmendment } from './actions';

export const metadata: Metadata = { title: 'Amendments' };

type Row = {
  _id: Types.ObjectId; status: string; reason: string; createdAt: Date; decidedAt?: Date; decisionComment?: string;
  changes: { field: string; from: unknown; to: unknown }[];
  evidence?: { _id: Types.ObjectId; originalName?: string };
  requestedBy: { _id: Types.ObjectId; name: string }; decidedBy?: { name: string };
  record: { _id: Types.ObjectId; degree: string; student: { matricNo: string; surname: string; otherNames: string } };
};

type Course = { code: string; title?: string; units?: number; grade?: string; semester?: number };

/** Proposed course results by semester with credit, quality point and GPA totals, as on the result sheet. */
function CourseChange({ from, to }: { from: Course[]; to: Course[] }) {
  const all = courseTotals(to);
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm"><b>Course results:</b> {from.length ? `${from.length} course(s) replaced by` : 'adds'} {to.length} course(s)</p>
      {semesterGroups(to).map((g) => {
        const t = courseTotals(g.courses);
        return (
          <div key={g.semester ?? 'p'} className="overflow-x-auto rounded-md border border-line">
            <table className="table">
              <thead>
                <tr><th colSpan={5} className="bg-slate-50 text-navy">{g.semester ? `${['First', 'Second', 'Third', 'Fourth'][g.semester - 1]} semester` : 'Project / thesis / dissertation'}</th></tr>
                <tr><th>Code</th><th>Title</th><th className="text-right">Credit</th><th>Grade</th><th className="text-right">Q-point</th></tr>
              </thead>
              <tbody>
                {g.courses.map((c, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{c.code}</td><td>{c.title}</td><td className="text-right">{c.units}</td><td>{c.grade ?? '—'}</td>
                    <td className="text-right tabular-nums">{c.grade && c.units != null ? c.units * GRADE_POINTS[c.grade as Letter] : ''}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td colSpan={2}>Total{g.semester && t.gpa != null ? ` · GPA ${t.gpa.toFixed(2)}` : ''}</td><td className="text-right">{t.credits}</td><td /><td className="text-right">{t.points}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-sm"><b>Grand total:</b> {all.credits} credits · {all.points} quality points{all.gpa != null && <> · FCGPA {all.gpa.toFixed(2)}</>}</p>
    </div>
  );
}

export default function AmendmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AmendmentsPageContent />
    </Suspense>
  );
}

async function AmendmentsPageContent() {
  const user = await requirePage('amendment:request', 'amendment:approve');
  await db();
  const rows = await Amendment.find().sort({ status: -1, createdAt: -1 }).limit(200)
    .populate('requestedBy', 'name').populate('decidedBy', 'name').populate('evidence', 'originalName')
    .populate({ path: 'record', select: 'degree student', populate: { path: 'student', select: 'matricNo surname otherNames' } })
    .lean<Row[]>();
  const pending = rows.filter((r) => r.status === 'PENDING');
  const done = rows.filter((r) => r.status !== 'PENDING');
  const canDecide = can(user.role, 'amendment:approve');

  return (
    <>
      <PageHeader
        title="Amendments to locked records"
        description="Corrections are requested by the Head of Records with evidence and approved by the Provost. Approval creates a new record version and revokes documents issued against the old one."
      />
      <div className="space-y-6">
        <Card title={`Pending (${pending.length})`} bodyClass={pending.length ? 'divide-y divide-line' : ''}>
          {pending.length ? pending.map((a) => (
            <div key={a._id.toString()} className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_1fr]">
              <div>
                <Link href={`/records/${a.record._id}`} className="link">{fullName(a.record.student)}</Link>
                <div className="text-xs text-muted"><span className="font-mono">{a.record.student.matricNo}</span> · {a.record.degree}</div>
                <div className={`mt-3 overflow-x-auto ${a.changes.some((c) => c.field !== 'courses') ? '' : 'hidden'}`}>
                  <table className="table">
                    <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
                    <tbody>{a.changes.filter((c) => c.field !== 'courses').map((c, i) => (
                      <tr key={i}><td className="font-medium">{c.field}</td><td className="text-red-700 line-through">{String(c.from ?? '—')}</td><td className="font-medium text-accent">{String(c.to ?? '—')}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {a.changes.filter((c) => c.field === 'courses').map((c, i) => (
                  <CourseChange key={i} from={(c.from as Course[] | null) ?? []} to={(c.to as Course[] | null) ?? []} />
                ))}
                <p className="mt-3 text-sm"><b>Reason:</b> {a.reason}</p>
                <p className="mt-1 text-xs text-muted">Requested by {a.requestedBy.name} on {fmtDate(a.createdAt)}</p>
                {canDecide && !a.requestedBy._id.equals(user.id) && (
                  <ActionForm action={decideAmendment.bind(null, a._id.toString())} className="mt-4 space-y-2">
                    <textarea name="comment" rows={2} className="input" placeholder="Comment (required to reject)" />
                    <div className="flex gap-2">
                      <SubmitButton name="decision" value="approve" className="btn-accent">Approve amendment</SubmitButton>
                      <SubmitButton name="decision" value="reject" className="btn-outline text-red-700">Reject</SubmitButton>
                    </div>
                  </ActionForm>
                )}
                {canDecide && a.requestedBy._id.equals(user.id) && (
                  <div className="mt-4">
                    <Alert tone="warning">
                      You requested this amendment, so you cannot approve it. Another officer with the Provost role must
                      decide it. This separation stops one person from changing a final result on their own.
                    </Alert>
                  </div>
                )}
                {!canDecide && (
                  <p className="mt-4 text-xs text-muted">Awaiting a decision by the Provost.</p>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted uppercase">Evidence</div>
                <ScanViewer files={a.evidence ? [{ id: a.evidence._id.toString(), name: a.evidence.originalName ?? 'evidence' }] : []} height="h-96" />
              </div>
            </div>
          )) : <EmptyState title="No pending amendments" />}
        </Card>

        <Card title="Decided" bodyClass="p-0">
          {done.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Graduand</th><th>Changes</th><th>Requested</th><th>Decision</th></tr></thead>
                <tbody>
                  {done.map((a) => (
                    <tr key={a._id.toString()}>
                      <td><Link href={`/records/${a.record._id}`} className="link">{a.record.student.matricNo}</Link></td>
                      <td className="text-xs">{a.changes.map((c) => c.field).join(', ')}</td>
                      <td className="text-xs">{a.requestedBy.name} · {fmtDate(a.createdAt)}</td>
                      <td>
                        <Badge tone={a.status === 'APPROVED' ? 'success' : 'danger'}>{titleCase(a.status)}</Badge>
                        <div className="mt-1 text-xs text-muted">{a.decidedBy?.name} · {fmtDate(a.decidedAt)}</div>
                        {a.decisionComment && <div className="text-xs">{a.decisionComment}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="None yet" />}
        </Card>
      </div>
    </>
  );
}
