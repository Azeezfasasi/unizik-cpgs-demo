import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { can } from '@/lib/rbac';
import { canEdit, canView } from '@/lib/sheet-access';
import { diffSnapshots, rowFingerprint, snapshotRows, type RowSnapshot } from '@/lib/sheets';
import { FLOW, LEGACY_STEPS, ONLINE_STEPS, STATUS_LABELS, type FlowStage } from '@/lib/workflow';
import { boardLine, fmtDate, fmtDateTime, fullName, minutesSince } from '@/lib/format';
import { classConsistency } from '@/lib/grading';
import { getGradingBands } from '@/lib/settings';
import { AcademicSession, Department, DigitizationBatch, GraduandRecord, Programme, ResultSheet, StoredFile } from '@/models';
import { Alert, Badge, Card, ClassBadge, DetailList, PageHeader, StatusBadge, Steps, PageSkeleton } from '@/components/ui';
import { ScanViewer } from '@/components/ScanViewer';
import { ActionForm, SubmitButton } from '@/components/forms';
import { SheetUploader } from './SheetUploader';
import { LegacyRowForm } from './LegacyRowForm';
import {
  decideSheet, deleteRow, detachFile, importLegacyRows, lockSheet, markIndexed, qaDecision, returnFromRecords, saveLegacyRow, submitSheet, uploadWorkbook,
} from '../actions';

export const metadata: Metadata = { title: 'Result sheet' };

export default function SheetPage(props: PageProps<'/sheets/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SheetPageContent {...props} />
    </Suspense>
  );
}

async function SheetPageContent({ params }: PageProps<'/sheets/[id]'>) {
  const { id } = await params;
  const user = await requireUser();
  if (!Types.ObjectId.isValid(id)) notFound();
  await db();
  const sheet = await ResultSheet.findById(id).lean();
  if (!sheet || !(await canView(user, sheet))) notFound();

  const [dept, prog, session, batch, files, records, grading] = await Promise.all([
    Department.findById(sheet.department).populate<{ faculty: { name: string } }>('faculty', 'name').lean(),
    Programme.findById(sheet.programme).lean(),
    AcademicSession.findById(sheet.session).lean(),
    sheet.batch ? DigitizationBatch.findById(sheet.batch).lean() : null,
    StoredFile.find({ _id: { $in: sheet.files } }).lean(),
    GraduandRecord.find({ sheet: sheet._id })
      .populate<{ student: { matricNo: string; surname: string; otherNames: string; sex?: string } }>('student', 'matricNo surname otherNames sex')
      .lean(),
    getGradingBands(),
  ]);
  // Same code that is printed in the footer of the sheet for signing.
  const fingerprint = records.length ? rowFingerprint(await snapshotRows(sheet._id)) : null;
  records.sort((a, b) => a.student.matricNo.localeCompare(b.student.matricNo));
  await audit(user, 'sheet.view', 'ResultSheet', id);

  const editable = await canEdit(user, sheet);
  const online = sheet.origin === 'ONLINE';
  const stage = FLOW[sheet.status as FlowStage];
  const myStage = online && stage?.role === user.role;
  const isMaker = sheet.createdBy.equals(user.id) || sheet.approvals.some((a) => a.stage === 'INDEXING' && a.by?.equals(user.id));
  const canQa = !online && sheet.status === 'INDEXED' && can(user.role, 'legacy:qa') && !isMaker &&
    (user.role !== 'QA_REVIEWER' || !!batch?.reviewer?.equals(user.id));
  const canLock = !online && sheet.status === 'QA_PASSED' && can(user.role, 'record:lock');
  const fileList = files.map((f) => ({ id: f._id.toString(), name: f.originalName ?? 'scan' }));
  const lastReturn = [...sheet.approvals].reverse().find((a) => a.action === 'RETURN');
  const diff = diffSnapshots(sheet.previousSubmittedRows as RowSnapshot[] | undefined, sheet.lastSubmittedRows as RowSnapshot[] | undefined);
  const illegible = records.filter((r) => r.illegible).length;
  const latest = sheet.approvals.at(-1);
  const justActed = latest?.by?.equals(user.id) && minutesSince(latest.at) < 3 ? latest : null;

  const id_ = sheet._id.toString();

  return (
    <>
      <PageHeader
        back={online ? (can(user.role, 'submission:approve') ? { href: '/approvals', label: 'Approvals' } : { href: '/submissions', label: 'Submissions' })
          : { href: batch ? `/digitization/batches/${batch._id}` : '/digitization', label: batch ? `Box ${batch.boxCode}` : 'Digitization' }}
        title={sheet.reference}
        description={<>{prog?.name} · {session?.label} · {dept?.name}</>}
        actions={<><Badge tone={online ? 'brand' : 'dark'}>{online ? 'Online submission' : 'Legacy scan'}</Badge><StatusBadge status={sheet.status} /></>}
      />

      <div className="mb-6 card px-5 py-4">
        <Steps steps={online ? ONLINE_STEPS : LEGACY_STEPS} current={sheet.status === 'RETURNED' ? (online ? 'SUBMITTED' : 'DRAFT') : sheet.status}
          returned={sheet.status === 'RETURNED'} />
      </div>

      {justActed && (
        <div className="mb-6"><Alert tone="success">✓ Done: {actionLabel(justActed.action, justActed.stage).toLowerCase()} by you at {fmtDateTime(justActed.at)}. The sheet is now <b>{STATUS_LABELS[sheet.status]}</b>.</Alert></div>
      )}
      {sheet.status === 'RETURNED' && lastReturn && (
        <div className="mb-6"><Alert tone="danger"><b>Returned by {lastReturn.byName} on {fmtDate(lastReturn.at)}:</b> {lastReturn.comment}</Alert></div>
      )}
      {illegible > 0 && <div className="mb-6"><Alert tone="warning">{illegible} row(s) flagged illegible and need the Head of Records&apos; attention.</Alert></div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: source scan */}
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card title="Source scan" actions={<span className="text-xs text-muted">{files.length} file(s)</span>}>
            <ScanViewer files={fileList} />
            {editable && (
              <div className="mt-4 space-y-3">
                <SheetUploader sheetId={id_} purpose={online ? 'SUBMISSION_SCAN' : 'LEGACY_SCAN'}
                  label={online ? 'Attach the signed and stamped result sheet' : 'Upload scanned pages'} />
                {files.map((f) => (
                  <ActionForm key={f._id.toString()} action={detachFile.bind(null, id_)} className="text-xs" confirm="Remove this scan from the sheet?">
                    <div className="flex items-center justify-between">
                      <input type="hidden" name="fileId" value={f._id.toString()} />
                      <span className="truncate">{f.originalName} <span className="font-mono text-muted">sha256 {f.sha256.slice(0, 12)}…</span></span>
                      <SubmitButton className="text-red-700 hover:underline" pendingText="…">Remove</SubmitButton>
                    </div>
                  </ActionForm>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: actions + data */}
        <div className="space-y-6">
          {online && editable && (
            <Card title="Prepare and submit">
              <ol className="space-y-5 text-sm">
                <li>
                  <div className="font-medium text-navy">1. Download the result template</div>
                  <p className="mt-1 text-muted">
                    Fill one row per graduand on the Graduands sheet and one row per course on the Courses sheet.
                    The CSV version holds graduand rows only, without courses.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a className="btn-outline" href={`/api/templates/result-sheet?sheet=${id_}`}>Download template (.xlsx)</a>
                    <a className="btn-outline" href={`/api/templates/result-sheet?sheet=${id_}&format=csv`}>Download CSV template</a>
                  </div>
                </li>
                <li>
                  <div className="font-medium text-navy">2. Upload the filled template</div>
                  <p className="mt-1 text-muted">Every cell is checked before anything is saved. Re-uploading replaces all rows.</p>
                  <ActionForm action={uploadWorkbook.bind(null, id_)} className="mt-2" resetOnSuccess>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="file" name="workbook" accept=".xlsx,.csv" required className="input file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-brand" />
                      <SubmitButton pendingText="Checking…">Validate and save</SubmitButton>
                    </div>
                  </ActionForm>
                </li>
                <li>
                  <div className="font-medium text-navy">3. Print, sign, stamp and attach the result sheet</div>
                  <p className="mt-1 text-muted">
                    Download the result sheet built from your uploaded rows, print it, and have it signed by the PG Coordinator,
                    Head of Department and External Examiner, then stamped. Scan it (PDF, 300 dpi, colour, all pages) and attach it
                    with the upload box beside the scan viewer. The signed scan remains the legal source.
                  </p>
                  {fingerprint ? (
                    <>
                      <a className="btn-outline mt-2" href={`/api/sheets/${id_}/signing-sheet`} target="_blank" rel="noreferrer">Download sheet for signing (PDF)</a>
                      <p className="mt-2 text-xs text-muted">
                        Its footer shows row fingerprint <span className="font-mono font-semibold text-navy">{fingerprint}</span>.
                        If you re-upload the template with changes, print and sign a new sheet: the fingerprint will change.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-amber-800">Upload the filled template first; the sheet for signing is built from its rows.</p>
                  )}
                </li>
                <li>
                  <div className="font-medium text-navy">4. Submit for approval</div>
                  <ActionForm action={submitSheet.bind(null, id_)} className="mt-2 space-y-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="attest" className="mt-1 accent-brand" />
                      I confirm the {records.length} row(s) below match the signed and stamped result sheet.
                    </label>
                    <SubmitButton className="btn-accent">{sheet.status === 'RETURNED' ? 'Resubmit to HOD' : 'Submit to HOD'}</SubmitButton>
                  </ActionForm>
                </li>
              </ol>
            </Card>
          )}

          {myStage && (
            <Card title={`Your decision: ${stage.label}`}>
              {diff && (diff.added.length || diff.removed.length || diff.changed.length) ? (
                <div className="mb-4"><Alert tone="warning">
                  <b>Changed since the previous submission:</b>
                  {diff.added.length > 0 && <div>Added: {diff.added.join(', ')}</div>}
                  {diff.removed.length > 0 && <div>Removed: {diff.removed.join(', ')}</div>}
                  {diff.changed.map((c) => <div key={c.matricNo}>{c.matricNo}: {c.fields.join(', ')}</div>)}
                </Alert></div>
              ) : null}
              {sheet.status === 'FACULTY_APPROVED' && (
                <p className="mb-3 text-sm text-muted">Records verification: compare every row with the attached signed scan before approving.</p>
              )}
              {fingerprint && (
                <p className="mb-3 text-sm text-muted">
                  Check that the attached scan is signed and stamped, and that its footer shows row fingerprint{' '}
                  <span className="font-mono font-semibold text-navy">{fingerprint}</span>. A different code means the rows changed after signing: return the sheet.
                </p>
              )}
              <ActionForm action={decideSheet.bind(null, id_)} className="space-y-3">
                {stage.next === 'SENATE_APPROVED' && (
                  <div>
                    <label className="label" htmlFor="senateDate">Board approval date</label>
                    <input id="senateDate" name="senateDate" type="date" className="input max-w-xs" />
                    <p className="mt-1 text-xs text-muted">Approving locks every record on this sheet permanently.</p>
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="comment">Comment <span className="font-normal text-muted">(required to return)</span></label>
                  <textarea id="comment" name="comment" rows={3} className="input" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve" className="btn-accent">
                    {stage.next === 'SENATE_APPROVED' ? 'Record Board approval and lock' : 'Approve'}
                  </SubmitButton>
                  <SubmitButton name="decision" value="return" className="btn-outline text-red-700">Return to department</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          {!online && editable && (
            <Card title="Import from a spreadsheet (Excel or CSV)">
              <p className="text-sm text-muted">
                Type the graduands from the scan into the template, then import them all at once. Every row is checked exactly as
                in the form below; if any row has a problem nothing is saved. Rows whose matric number is already on this sheet are
                updated, new ones are added, and existing rows are never deleted.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn-outline" href={`/api/templates/result-sheet?sheet=${id_}`}>Excel template (with courses)</a>
                <a className="btn-outline" href={`/api/templates/result-sheet?sheet=${id_}&format=csv`}>CSV template</a>
              </div>
              <ActionForm action={importLegacyRows.bind(null, id_)} className="mt-4 space-y-3" resetOnSuccess>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="import-file">Filled template</label>
                    <input id="import-file" type="file" name="file" accept=".xlsx,.csv" required
                      className="input file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-brand" />
                  </div>
                  <div>
                    <label className="label" htmlFor="import-source">Rows were read from scan</label>
                    {/* Keyed on the attached scans so the default follows a newly uploaded scan. */}
                    <select key={fileList.map((x) => x.id).join()} id="import-source" name="sourceFile" className="input"
                      defaultValue={fileList.length === 1 ? fileList[0].id : ''}>
                      <option value="">—</option>
                      {fileList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Optional columns: <b>Source Page</b> (page of the scan), <b>Illegible (Y/N)</b> (sends the row to the Head of
                  Records instead of a guess) and <b>Remarks</b>.
                </p>
                <SubmitButton pendingText="Checking…">Validate and import</SubmitButton>
              </ActionForm>
              <div className="mt-5 border-t border-line pt-4 text-sm">
                <div className="font-medium text-navy">Certified transcription for signing</div>
                <p className="mt-1 text-muted">
                  Once the rows are in, download the transcription of this sheet for the Indexer, QA Reviewer and Taskforce Lead to sign
                  and the Records Unit to stamp. It certifies that the typed rows match the original sheet in the box.
                </p>
                {fingerprint ? (
                  <>
                    <a className="btn-outline mt-2" href={`/api/sheets/${id_}/signing-sheet`} target="_blank" rel="noreferrer">Download certified transcription (PDF)</a>
                    <p className="mt-2 text-xs text-muted">
                      Footer fingerprint <span className="font-mono font-semibold text-navy">{fingerprint}</span>. If rows change after
                      printing, the fingerprint changes: print and sign a new copy.
                    </p>
                  </>
                ) : <p className="mt-2 text-xs text-amber-800">Import or enter graduand rows first; the transcription is built from them.</p>}
              </div>
            </Card>
          )}

          {!online && editable && (
            <Card title="Or index graduands one by one">
              <LegacyRowForm action={saveLegacyRow.bind(null, id_)} files={fileList} />
              <div className="mt-5 border-t border-line pt-4">
                <ActionForm action={markIndexed.bind(null, id_)} confirm="Send this sheet for QA? You will not be able to edit it unless it is returned.">
                  <SubmitButton className="btn-accent">Indexing complete: send to QA</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          )}

          {canQa && (
            <Card title="QA review">
              <p className="mb-3 text-sm text-muted">Compare every row against the scan. Pass only if all values match exactly.</p>
              {fingerprint && (
                <p className="mb-3 text-sm text-muted">
                  If a signed transcription is attached, its footer must show row fingerprint <span className="font-mono font-semibold text-navy">{fingerprint}</span>.
                </p>
              )}
              <ActionForm action={qaDecision.bind(null, id_)} className="space-y-3">
                <textarea name="comment" rows={3} className="input" placeholder="Comments (required when returning)" />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="attest" className="mt-1 accent-brand" />
                  I compared all {records.length} row(s) against the scan.
                </label>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="pass" className="btn-accent">Pass QA</SubmitButton>
                  <SubmitButton name="decision" value="return" className="btn-outline text-red-700">Return to indexer</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
          {!online && sheet.status === 'INDEXED' && isMaker && can(user.role, 'legacy:qa') && (
            <Alert tone="brand">You indexed this sheet, so a different officer must perform QA.</Alert>
          )}

          {canLock && (
            <Card title="Records verification and lock">
              <p className="mb-3 text-sm text-muted">Spot-check rows against the scan. Locking archives every record on this sheet; later changes need an amendment.</p>
              {fingerprint && (
                <p className="mb-3 text-sm text-muted">
                  If a signed transcription is attached, its footer must show row fingerprint <span className="font-mono font-semibold text-navy">{fingerprint}</span>.
                </p>
              )}
              <ActionForm action={lockSheet.bind(null, id_)} className="space-y-3">
                <textarea name="comment" rows={2} className="input" placeholder="Note (optional)" />
                {illegible > 0 && (
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptIllegible" className="mt-1 accent-brand" />Lock despite {illegible} illegible row(s)</label>
                )}
                <SubmitButton className="btn-dark">Lock sheet</SubmitButton>
              </ActionForm>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted">Return to taskforce instead</summary>
                <ActionForm action={returnFromRecords.bind(null, id_)} className="mt-2 space-y-2">
                  <textarea name="comment" rows={2} className="input" placeholder="What must be corrected" />
                  <SubmitButton className="btn-outline text-red-700">Return</SubmitButton>
                </ActionForm>
              </details>
            </Card>
          )}

          <Card title={`Graduands (${records.length})`} bodyClass="p-0">
            {records.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Matric no</th><th>Name</th><th className="text-right">CGPA</th><th>Class</th>{!online && <th>Page</th>}<th /></tr></thead>
                  <tbody>
                    {records.map((r) => {
                      const warn = classConsistency(r.cgpa, r.classOfDegree as never, prog?.degreeType, grading.bands);
                      return (
                        <tr key={r._id.toString()}>
                          <td className="font-mono text-xs">
                            {r.locked ? <Link className="link" href={`/records/${r._id}`}>{r.student.matricNo}</Link> : r.student.matricNo}
                          </td>
                          <td>
                            {fullName(r.student)}
                            {r.thesisTitle && <div className="max-w-xs truncate text-xs text-muted" title={r.thesisTitle}>{r.thesisTitle}</div>}
                            {boardLine(r) && <div className="max-w-xs text-xs text-muted tabular-nums">{boardLine(r)}</div>}
                            <div className="flex flex-wrap gap-1">
                              {r.illegible && <Badge tone="warning">Illegible</Badge>}
                              {warn && <span title={warn}><Badge tone="warning">Check class</Badge></span>}
                              {r.courses?.length ? <span className="text-xs text-muted">{r.courses.length} courses</span> : null}
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{r.cgpa?.toFixed(2) ?? '—'}</td>
                          <td><ClassBadge cls={r.classOfDegree} /></td>
                          {!online && <td className="tabular-nums">{r.sourcePage ?? '—'}</td>}
                          <td className="text-right">
                            {editable && (
                              <ActionForm action={deleteRow.bind(null, id_)} confirm={`Delete ${r.student.matricNo} from this sheet?`}>
                                <input type="hidden" name="recordId" value={r._id.toString()} />
                                <SubmitButton className="text-xs text-red-700 hover:underline" pendingText="…">Delete</SubmitButton>
                              </ActionForm>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-5 text-sm text-muted">No graduand rows yet.</p>}
          </Card>

          <Card title="Details and history">
            <DetailList items={[
              ['Faculty', dept?.faculty?.name],
              ['Department', dept?.name],
              ['Programme', prog?.name],
              ['Session', session?.label],
              ['Box', batch ? <Link className="link" href={`/digitization/batches/${batch._id}`}>{batch.boxCode}</Link> : '—'],
              ['Board approval', fmtDate(sheet.senateApprovalDate)],
              ...(fingerprint ? [['Row fingerprint', (
                <span key="fp">
                  <span className="font-mono font-semibold text-navy">{fingerprint}</span>
                  <a className="ml-2 text-xs link" href={`/api/sheets/${id_}/signing-sheet`} target="_blank" rel="noreferrer">
                    {online ? 'Sheet for signing (PDF)' : 'Certified transcription (PDF)'}
                  </a>
                </span>
              )] as [string, ReactNode]] : []),
              ['Created', fmtDateTime(sheet.createdAt)],
              ['Last change', fmtDateTime(sheet.statusSince)],
            ]} />
            {sheet.approvals.length > 0 && (
              <ol className="mt-6 space-y-3 border-l-2 border-line pl-4">
                {sheet.approvals.map((a, i) => (
                  <li key={i} className="relative text-sm">
                    <span className={`absolute top-1.5 -left-5.25 h-2.5 w-2.5 rounded-full ${a.action === 'RETURN' ? 'bg-red-600' : a.action === 'LOCK' ? 'bg-navy' : 'bg-accent'}`} />
                    <div className="font-medium text-navy">{actionLabel(a.action, a.stage)}</div>
                    <div className="text-xs text-muted">{a.byName} · {fmtDateTime(a.at)}</div>
                    {a.comment && <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs">{a.comment}</div>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function actionLabel(action?: string | null, stage?: string | null) {
  if (action === 'SUBMIT') return stage === 'INDEXING' ? 'Indexing completed' : stage === 'RESUBMITTED' ? 'Resubmitted' : 'Submitted';
  if (action === 'LOCK') return 'Verified and locked by Records';
  const who = stage === 'QA' ? 'QA' : stage === 'RECORDS' ? 'Records' : FLOW[stage as FlowStage]?.label ?? stage;
  return `${action === 'RETURN' ? 'Returned' : 'Approved'} at ${who}`;
}

