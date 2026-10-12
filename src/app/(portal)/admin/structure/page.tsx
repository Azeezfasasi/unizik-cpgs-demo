import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { AcademicSession, Department, Faculty, Programme } from '@/models';
import { DEGREE_TYPES } from '@/models/Programme';
import { DEFAULT_BANDS, CLASS_LABELS } from '@/lib/grading';
import { Alert, Card, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createDepartment, createFaculty, createProgramme, createSession } from '../actions';

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
  const [faculties, departments, programmes, sessions] = await Promise.all([
    Faculty.find().sort({ name: 1 }).lean(),
    Department.find().sort({ name: 1 }).lean(),
    Programme.find().sort({ name: 1 }).lean(),
    AcademicSession.find().sort({ startYear: -1 }).lean(),
  ]);

  return (
    <>
      <PageHeader title="Academic structure" description="Faculties, departments, programmes, sessions and the grading table used by indexing and submission checks." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Faculties and departments (${faculties.length} / ${departments.length})`}>
          <ul className="mb-5 max-h-96 space-y-3 overflow-auto text-sm">
            {faculties.map((f) => (
              <li key={f._id.toString()}>
                <div className="font-medium text-navy">{f.name} <span className="font-mono text-xs text-muted">{f.code}</span></div>
                <ul className="mt-1 ml-4 list-disc text-muted">
                  {departments.filter((d) => d.faculty.equals(f._id)).map((d) => (
                    <li key={d._id.toString()}>
                      {d.name} <span className="font-mono text-xs">{d.code}</span>
                      {d.matricPattern && <span className="ml-2 font-mono text-xs text-brand">{d.matricPattern}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
            <ActionForm action={createFaculty} className="space-y-2" resetOnSuccess>
              <div className="text-sm font-semibold text-navy">Add faculty</div>
              <input name="name" required placeholder="Faculty of Agriculture" className="input" />
              <input name="code" required placeholder="AGR" className="input font-mono uppercase" />
              <SubmitButton className="btn-outline w-full">Add faculty</SubmitButton>
            </ActionForm>
            <ActionForm action={createDepartment} className="space-y-2" resetOnSuccess>
              <div className="text-sm font-semibold text-navy">Add department</div>
              <select name="faculty" required className="input">
                {faculties.map((f) => <option key={f._id.toString()} value={f._id.toString()}>{f.name}</option>)}
              </select>
              <input name="name" required placeholder="Agricultural Extension" className="input" />
              <input name="code" required placeholder="AEX" className="input font-mono uppercase" />
              <input name="matricPattern" placeholder="Matric regex (optional), e.g. ^20\d{8}$" className="input font-mono text-xs" />
              <SubmitButton className="btn-outline w-full">Add department</SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <Card title={`Programmes (${programmes.length})`}>
          <ul className="mb-5 max-h-96 space-y-1 overflow-auto text-sm">
            {programmes.map((p) => (
              <li key={p._id.toString()} className="flex justify-between gap-2">
                <span>{p.name}</span>
                <span className="text-xs text-muted">{departments.find((d) => d._id.equals(p.department))?.code} · {p.degreeType}</span>
              </li>
            ))}
          </ul>
          <ActionForm action={createProgramme} className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2" resetOnSuccess>
            <div className="text-sm font-semibold text-navy sm:col-span-2">Add programme</div>
            <select name="department" required className="input sm:col-span-2">
              {departments.map((d) => <option key={d._id.toString()} value={d._id.toString()}>{d.name}</option>)}
            </select>
            <input name="name" required placeholder="M.Sc. Agricultural Extension" className="input sm:col-span-2" />
            <input name="code" required placeholder="MSC-AEX" className="input font-mono uppercase" />
            <select name="degreeType" className="input">{DEGREE_TYPES.map((d) => <option key={d}>{d}</option>)}</select>
            <SubmitButton className="btn-outline sm:col-span-2">Add programme</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={`Sessions (${sessions.length})`}>
          <div className="mb-4 flex flex-wrap gap-2">
            {sessions.map((s) => <span key={s._id.toString()} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{s.label}</span>)}
          </div>
          <ActionForm action={createSession} className="flex gap-2 border-t border-line pt-4" resetOnSuccess>
            <input name="startYear" type="number" min="1960" max="2100" required placeholder="Start year, e.g. 2026" className="input" />
            <SubmitButton className="btn-outline whitespace-nowrap">Add session</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Class of degree bands (CGPA, 5-point scale)">
          <table className="table">
            <thead><tr><th>Class</th><th className="text-right">Minimum CGPA</th></tr></thead>
            <tbody>{DEFAULT_BANDS.map((b) => <tr key={b.cls}><td>{CLASS_LABELS[b.cls]}</td><td className="text-right tabular-nums">{b.min.toFixed(2)}</td></tr>)}</tbody>
          </table>
          <div className="mt-4"><Alert tone="warning">Provisional bands. Confirm the official CPGS grading table for each session before go-live; mismatches are shown to indexers and approvers as warnings, never silently corrected.</Alert></div>
        </Card>
      </div>
    </>
  );
}
