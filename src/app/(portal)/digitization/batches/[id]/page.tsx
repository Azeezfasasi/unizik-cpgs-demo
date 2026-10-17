import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listSheets } from '@/lib/queries';
import { fmtDate, titleCase } from '@/lib/format';
import { boxDepartmentIds, boxDepartmentLabel } from '@/lib/boxes';
import { AcademicSession, DigitizationBatch, Programme, User } from '@/models';
import { Badge, Card, DetailList, PageHeader, PageSkeleton } from '@/components/ui';
import { SheetTable } from '@/components/SheetTable';
import { ActionForm, SubmitButton } from '@/components/forms';
import { PrintButton } from '@/components/PrintButton';
import { assignBatch, setBatchStatus } from '../../actions';
import { createLegacySheet, importBoardList } from '../../../sheets/actions';
import { BoardImportForm } from './BoardImportForm';

export const metadata: Metadata = { title: 'Box' };

type Batch = {
  _id: Types.ObjectId; boxCode: string; status: string; condition: string; priority: number; estimatedSheets: number;
  location?: string; notes?: string; createdAt: Date;
  department?: { _id: Types.ObjectId; name: string; code: string }; departments?: { _id: Types.ObjectId; name: string; code: string }[];
  allDepartments?: boolean; sessions: { _id: Types.ObjectId; label: string }[];
  indexer?: { _id: Types.ObjectId; name: string }; reviewer?: { _id: Types.ObjectId; name: string };
};

export default function BatchPage(props: PageProps<'/digitization/batches/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BatchPageContent {...props} />
    </Suspense>
  );
}

async function BatchPageContent({ params }: PageProps<'/digitization/batches/[id]'>) {
  const { id } = await params;
  const user = await requirePage('digitization:view');
  if (!Types.ObjectId.isValid(id)) notFound();
  await db();
  const b = await DigitizationBatch.findById(id)
    .populate('department', 'name code').populate('departments', 'name code').populate('sessions', 'label')
    .populate('indexer', 'name').populate('reviewer', 'name').lean<Batch>();
  if (!b) notFound();
  const mine = b.indexer?._id.equals(user.id) || b.reviewer?._id.equals(user.id);
  if ((user.role === 'INDEXER' || user.role === 'QA_REVIEWER') && !mine) notFound();

  const canAssign = can(user.role, 'batch:assign');
  const canIndex = user.role === 'TASKFORCE_LEAD' || (user.role === 'INDEXER' && b.indexer?._id.equals(user.id));
  const deptIds = boxDepartmentIds(b);

  const [sheets, programmes, sessions, indexers, reviewers, qr, allSessions] = await Promise.all([
    listSheets({ batch: b._id }),
    Programme.find(deptIds ? { department: { $in: deptIds } } : {}).sort({ name: 1 })
      .populate<{ department: { _id: Types.ObjectId; name: string } }>('department', 'name').lean(),
    AcademicSession.find({ _id: { $in: b.sessions.map((s) => s._id) } }).sort({ startYear: 1 }).lean(),
    canAssign ? User.find({ isActive: true, role: { $in: ['INDEXER', 'TASKFORCE_LEAD'] } }).sort({ name: 1 }).lean() : [],
    canAssign ? User.find({ isActive: true, role: { $in: ['QA_REVIEWER', 'HEAD_RECORDS'] } }).sort({ name: 1 }).lean() : [],
    QRCode.toDataURL(`${b.boxCode}`, { margin: 1, width: 160, color: { dark: '#0f172a' } }),
    canIndex ? AcademicSession.find().sort({ startYear: -1 }).lean() : [],
  ]);
  const boxSessionIds = new Set(sessions.map((s) => s._id.toString()));
  const otherSessions = allSessions.filter((s) => !boxSessionIds.has(s._id.toString()));

  return (
    <>
      <PageHeader
        back={{ href: '/digitization', label: 'Digitization' }}
        title={`Box ${b.boxCode}`}
        description={`${boxDepartmentLabel(b)} · ${b.sessions.map((s) => s.label).join(', ')}`}
        actions={<Badge tone={b.status === 'COMPLETED' ? 'success' : 'brand'}>{titleCase(b.status)}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {canIndex && b.status !== 'COMPLETED' && (
            <Card title="Start a result sheet from this box">
              {programmes.length ? (
                <ActionForm action={createLegacySheet} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                  <input type="hidden" name="batch" value={id} />
                  <div>
                    <label className="label" htmlFor="programme">Programme</label>
                    <select id="programme" name="programme" required className="input">
                      {groupByDepartment(programmes).map(([dept, list]) => (
                        <optgroup key={dept} label={dept}>
                          {list.map((p) => <option key={p._id.toString()} value={p._id.toString()}>{p.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="session">Session</label>
                    <select id="session" name="session" required className="input">
                      {sessions.map((s) => <option key={s._id.toString()} value={s._id.toString()}>{s.label}</option>)}
                    </select>
                  </div>
                  <SubmitButton>Create sheet</SubmitButton>
                </ActionForm>
              ) : <p className="text-sm text-muted">No programmes are registered for the departments in this box yet. Add them in Academic structure.</p>}
              <p className="mt-3 text-xs text-muted">Scan standard: 300 dpi minimum, colour, one PDF per result sheet, saved as PDF/A. Use the flatbed for fragile pages.</p>
            </Card>
          )}

          {canIndex && b.status !== 'COMPLETED' && (
            <Card title="Import a PG Board result list">
              <p className="mb-4 text-sm">
                Upload the board list Excel file as it is (title rows, then S/N, NAME/REG. NO., FACULTY, DEPARTMENT, PROG.,
                semester GPAs, PROJECT, FCGPA, EFFECTIVE DATE OF GRADUATION, AREA OF SPECIALIZATION). One result sheet is
                made for each programme in it, and the board meeting number is read from the title.
              </p>
              <BoardImportForm
                action={importBoardList.bind(null, id)}
                boxSessions={sessions.map((s) => ({ id: s._id.toString(), label: s.label }))}
                otherSessions={otherSessions.map((s) => ({ id: s._id.toString(), label: s.label }))}
              />
            </Card>
          )}

          <Card title={`Result sheets (${sheets.length})`} bodyClass="p-0">
            <SheetTable rows={sheets} empty="No sheets created from this box yet" showDept={false} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Box label" actions={<PrintButton />}>
            <div className="flex items-center gap-4 print:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR label for ${b.boxCode}`} width={96} height={96} />
              <div>
                <div className="font-mono text-lg font-bold text-navy">{b.boxCode}</div>
                <div className="text-xs text-muted">{boxDepartmentLabel(b, 'code')} · {b.sessions.map((s) => s.label).join(', ')}</div>
              </div>
            </div>
          </Card>

          <Card title="Details">
            <DetailList items={[
              ['Condition', titleCase(b.condition)],
              ['Priority', `${b.priority} (1 = most urgent)`],
              ['Estimated sheets', b.estimatedSheets],
              ['Location', b.location],
              ['Inventoried', fmtDate(b.createdAt)],
              ['Notes', b.notes],
            ]} />
          </Card>

          {canAssign && (
            <Card title="Assignments">
              <ActionForm action={assignBatch.bind(null, id)} className="space-y-3">
                <div>
                  <label className="label" htmlFor="indexer">Indexer</label>
                  <select id="indexer" name="indexer" defaultValue={b.indexer?._id.toString() ?? ''} className="input">
                    <option value="">Unassigned</option>
                    {indexers.map((u) => <option key={u._id.toString()} value={u._id.toString()}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="reviewer">QA reviewer</label>
                  <select id="reviewer" name="reviewer" defaultValue={b.reviewer?._id.toString() ?? ''} className="input">
                    <option value="">Unassigned</option>
                    {reviewers.map((u) => <option key={u._id.toString()} value={u._id.toString()}>{u.name}</option>)}
                  </select>
                </div>
                <SubmitButton className="btn-primary w-full">Save assignments</SubmitButton>
              </ActionForm>
              <ActionForm action={setBatchStatus.bind(null, id)} className="mt-4 border-t border-line pt-4">
                <div className="flex gap-2">
                  <select name="status" defaultValue={b.status} className="input">
                    <option value="INVENTORIED">Inventoried</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>
                  </select>
                  <SubmitButton className="btn-outline">Update</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/** Programmes as [department name, programmes] pairs, departments in name order, for <optgroup>s. */
function groupByDepartment<T extends { department: { name: string } }>(list: T[]) {
  const by = new Map<string, T[]>();
  for (const p of list) by.set(p.department.name, [...(by.get(p.department.name) ?? []), p]);
  return [...by].sort(([a], [b]) => a.localeCompare(b));
}
