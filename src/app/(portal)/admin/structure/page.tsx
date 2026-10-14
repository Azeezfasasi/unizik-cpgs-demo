import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { AcademicSession, Department, Faculty, Programme } from '@/models';
import { DEGREE_TYPES } from '@/models/Programme';
import { CLASS_LABELS } from '@/lib/grading';
import { getGradingBands } from '@/lib/settings';
import { describeUsage, usageMap } from '@/lib/structure';
import { fmtDateTime } from '@/lib/format';
import { Alert, Card, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { EditPanel } from '@/components/EditPanel';
import {
  createDepartment, createFaculty, createProgramme, createSession, deleteDepartment, deleteFaculty, deleteProgramme,
  deleteSession, saveGradingBands, updateDepartment, updateFaculty, updateProgramme, updateSession,
} from '../actions';

export const metadata: Metadata = { title: 'Academic structure' };

export default function StructurePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StructurePageContent />
    </Suspense>
  );
}

async function StructurePageContent() {
  await requirePage('structure:manage');
  await db();
  const [faculties, departments, programmes, sessions, grading, facUse, depUse, progUse, sesUse] = await Promise.all([
    Faculty.find().sort({ name: 1 }).lean(),
    Department.find().sort({ name: 1 }).lean(),
    Programme.find().sort({ name: 1 }).lean(),
    AcademicSession.find().sort({ startYear: -1 }).lean(),
    getGradingBands(),
    usageMap('faculty'),
    usageMap('department'),
    usageMap('programme'),
    usageMap('session'),
  ]);
  const usage = (m: Map<string, Record<string, number>>, id: unknown) => {
    const u = m.get(String(id));
    return u && Object.keys(u).length ? describeUsage(u) : undefined;
  };
  const deptOptions = departments.map((d) => <option key={d._id.toString()} value={d._id.toString()}>{d.name}</option>);
  const facultyOptions = faculties.map((f) => <option key={f._id.toString()} value={f._id.toString()}>{f.name}</option>);

  return (
    <>
      <PageHeader
        title="Academic structure"
        description="Faculties, departments, programmes, sessions and the grading table used by indexing and submission checks. Click any item to edit or delete it. Items still referenced by results, students or staff cannot be deleted."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={`Faculties and departments (${faculties.length} / ${departments.length})`}>
          <ul className="mb-5 max-h-128 space-y-4 overflow-auto pr-1 text-sm">
            {faculties.map((f) => {
              const id = f._id.toString();
              return (
                <li key={id}>
                  <EditPanel
                    itemLabel={f.name} inUse={usage(facUse, id)}
                    update={updateFaculty.bind(null, id)} remove={deleteFaculty.bind(null, id)}
                    summary={<span className="font-medium text-navy">{f.name} <span className="font-mono text-xs text-muted">{f.code}</span></span>}
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem]">
                      <input name="name" defaultValue={f.name} required aria-label="Faculty name" className="input" />
                      <input name="code" defaultValue={f.code} required aria-label="Faculty code" className="input font-mono uppercase" />
                    </div>
                  </EditPanel>
                  <ul className="mt-1 ml-4 space-y-0.5 border-l border-line pl-3">
                    {departments.filter((d) => d.faculty.equals(f._id)).map((d) => {
                      const did = d._id.toString();
                      return (
                        <li key={did}>
                          <EditPanel
                            itemLabel={d.name} inUse={usage(depUse, did)}
                            update={updateDepartment.bind(null, did)} remove={deleteDepartment.bind(null, did)}
                            summary={
                              <span className="text-slate-700">
                                {d.name} <span className="font-mono text-xs text-muted">{d.code}</span>
                                {d.matricPattern && <span className="ml-2 font-mono text-xs text-brand">{d.matricPattern}</span>}
                              </span>
                            }
                          >
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem]">
                              <input name="name" defaultValue={d.name} required aria-label="Department name" className="input" />
                              <input name="code" defaultValue={d.code} required aria-label="Department code" className="input font-mono uppercase" />
                            </div>
                            <select name="faculty" defaultValue={f._id.toString()} aria-label="Faculty" className="input">{facultyOptions}</select>
                            <input name="matricPattern" defaultValue={d.matricPattern ?? ''} placeholder="Matric regex (optional)" aria-label="Matric number pattern" className="input font-mono text-xs" />
                          </EditPanel>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-1 gap-5 border-t border-line pt-4 sm:grid-cols-2">
            <ActionForm action={createFaculty} className="space-y-2" resetOnSuccess>
              <div className="text-sm font-semibold text-navy">Add faculty</div>
              <input name="name" required placeholder="Faculty of Agriculture" aria-label="Faculty name" className="input" />
              <input name="code" required placeholder="AGR" aria-label="Faculty code" className="input font-mono uppercase" />
              <SubmitButton className="btn-outline w-full">Add faculty</SubmitButton>
            </ActionForm>
            <ActionForm action={createDepartment} className="space-y-2" resetOnSuccess>
              <div className="text-sm font-semibold text-navy">Add department</div>
              <select name="faculty" required aria-label="Faculty" className="input">{facultyOptions}</select>
              <input name="name" required placeholder="Agricultural Extension" aria-label="Department name" className="input" />
              <input name="code" required placeholder="AEX" aria-label="Department code" className="input font-mono uppercase" />
              <input name="matricPattern" placeholder="Matric regex (optional), e.g. ^20\d{8}$" aria-label="Matric number pattern" className="input font-mono text-xs" />
              <SubmitButton className="btn-outline w-full">Add department</SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <Card title={`Programmes (${programmes.length})`}>
          <ul className="mb-5 max-h-128 space-y-0.5 overflow-auto pr-1 text-sm">
            {programmes.map((p) => {
              const id = p._id.toString();
              const dept = departments.find((d) => d._id.equals(p.department));
              return (
                <li key={id}>
                  <EditPanel
                    itemLabel={p.name} inUse={usage(progUse, id)}
                    update={updateProgramme.bind(null, id)} remove={deleteProgramme.bind(null, id)}
                    summary={
                      <span className="flex justify-between gap-2">
                        <span>{p.name}</span>
                        <span className="text-xs whitespace-nowrap text-muted">{dept?.code} · {p.degreeType}</span>
                      </span>
                    }
                  >
                    <input name="name" defaultValue={p.name} required aria-label="Programme name" className="input" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input name="code" defaultValue={p.code} required aria-label="Programme code" className="input font-mono uppercase" />
                      <select name="degreeType" defaultValue={p.degreeType} aria-label="Degree type" className="input">
                        {DEGREE_TYPES.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <select name="department" defaultValue={p.department.toString()} aria-label="Department" className="input">{deptOptions}</select>
                  </EditPanel>
                </li>
              );
            })}
          </ul>
          <ActionForm action={createProgramme} className="grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-2" resetOnSuccess>
            <div className="text-sm font-semibold text-navy sm:col-span-2">Add programme</div>
            <select name="department" required aria-label="Department" className="input sm:col-span-2">{deptOptions}</select>
            <input name="name" required placeholder="M.Sc. Agricultural Extension" aria-label="Programme name" className="input sm:col-span-2" />
            <input name="code" required placeholder="MSC-AEX" aria-label="Programme code" className="input font-mono uppercase" />
            <select name="degreeType" aria-label="Degree type" className="input">{DEGREE_TYPES.map((d) => <option key={d}>{d}</option>)}</select>
            <SubmitButton className="btn-outline sm:col-span-2">Add programme</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={`Sessions (${sessions.length})`}>
          <ul className="mb-4 grid grid-cols-1 max-h-96 gap-0.5 overflow-auto pr-1 sm:grid-cols-2">
            {sessions.map((s) => {
              const id = s._id.toString();
              return (
                <li key={id}>
                  <EditPanel
                    itemLabel={`session ${s.label}`} inUse={usage(sesUse, id)}
                    update={updateSession.bind(null, id)} remove={deleteSession.bind(null, id)}
                    summary={<span className="font-mono text-xs">{s.label}{usage(sesUse, id) && <span className="ml-2 font-sans text-muted">in use</span>}</span>}
                  >
                    <input name="startYear" type="number" min="1960" max="2100" defaultValue={s.startYear} required aria-label="Start year" className="input" />
                    <p className="text-xs text-muted">Only unused sessions can change year.</p>
                  </EditPanel>
                </li>
              );
            })}
          </ul>
          <ActionForm action={createSession} className="border-t border-line pt-4" resetOnSuccess>
            <div className="flex gap-2">
              <input name="startYear" type="number" min="1960" max="2100" required placeholder="Start year, e.g. 2026" aria-label="Start year" className="input" />
              <SubmitButton className="btn-outline whitespace-nowrap">Add session</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Class of degree bands (CGPA, 5-point scale)">
          <ActionForm action={saveGradingBands} className="space-y-4">
            <table className="table">
              <thead><tr><th>Class</th><th className="text-right">Minimum CGPA</th></tr></thead>
              <tbody>
                {grading.bands.map((b) => (
                  <tr key={b.cls}>
                    <td><label htmlFor={`band-${b.cls}`}>{CLASS_LABELS[b.cls]}</label></td>
                    <td className="text-right">
                      {b.cls === 'FAIL'
                        ? <span className="tabular-nums">0.00</span>
                        : <input id={`band-${b.cls}`} name={b.cls} type="number" step="0.01" min="0.01" max="5" required
                            defaultValue={b.min.toFixed(2)} className="input ml-auto w-24 text-right tabular-nums" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SubmitButton className="btn-primary">Save grading bands</SubmitButton>
          </ActionForm>
          <div className="mt-4">
            {grading.saved
              ? <Alert tone="success">Official bands saved {fmtDateTime(grading.updatedAt)}. CGPA and class mismatches are flagged as warnings, never silently corrected.</Alert>
              : <Alert tone="warning">These are provisional default bands. Enter the official CPGS grading table and save to make it authoritative.</Alert>}
          </div>
        </Card>
      </div>
    </>
  );
}
