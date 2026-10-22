'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { FileUploader } from '@/components/FileUploader';
import { courseTotals } from '@/lib/grading';
import { requestCourseResults } from '../../amendments/actions';

type Row = { code: string; title: string; units: string; grade: string };
type Course = { code: string; title?: string; units?: number; grade?: string; semester?: number };

const ORD = ['First', 'Second', 'Third', 'Fourth'];
const GRADES = ['A', 'B', 'C', 'D', 'E', 'F'];
const blank = (): Row => ({ code: '', title: '', units: '', grade: '' });
const toRow = (c: Course): Row => ({ code: c.code, title: c.title ?? '', units: c.units != null ? String(c.units) : '', grade: c.grade ?? '' });
const filled = (r: Row) => r.code.trim() || r.title.trim() || r.units.trim() || r.grade;
const graded = (rows: Row[]) => rows.filter(filled).map((r) => ({ units: Number(r.units) || 0, grade: r.grade }));

/**
 * Course results of a locked record as on the Student's Final Result sheet: one table per semester
 * (2 to 4) plus the project / thesis / dissertation, with credit, quality point and GPA totals.
 * Sent to the Provost as an amendment with the scanned sheet as evidence.
 */
export function CourseResultsForm({ recordId, courses, cgpa }: { recordId: string; courses: Course[]; cgpa?: number | null }) {
  const sems = Math.max(2, ...courses.map((c) => c.semester ?? 0));
  const [semesters, setSemesters] = useState<Row[][]>(() =>
    Array.from({ length: sems }, (_, i) => {
      const rows = courses.filter((c) => c.semester === i + 1).map(toRow);
      return rows.length ? rows : [blank(), blank(), blank()];
    }));
  const [project, setProject] = useState<Row[]>(() => {
    const rows = courses.filter((c) => !c.semester).map(toRow);
    return rows.length ? rows : [blank()];
  });
  const [evidence, setEvidence] = useState('');

  const edit = (s: number | 'p', i: number, patch: Partial<Row>) => {
    if (s === 'p') setProject((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    else setSemesters((all) => all.map((rows, k) => (k === s ? rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) : rows)));
  };
  const add = (s: number | 'p') => (s === 'p' ? setProject((p) => [...p, blank()]) : setSemesters((all) => all.map((rows, k) => (k === s ? [...rows, blank()] : rows))));
  const remove = (s: number | 'p', i: number) => (s === 'p'
    ? setProject((p) => p.filter((_, j) => j !== i))
    : setSemesters((all) => all.map((rows, k) => (k === s ? rows.filter((_, j) => j !== i) : rows))));

  const payload: Course[] = [
    ...semesters.flatMap((rows, s) => rows.filter(filled).map((r) => ({ code: r.code, title: r.title, units: r.units as unknown as number, grade: r.grade || undefined, semester: s + 1 }))),
    ...project.filter(filled).map((r) => ({ code: r.code, title: r.title, units: r.units as unknown as number, grade: r.grade || undefined })),
  ];
  const all = courseTotals([...semesters.flatMap(graded), ...graded(project)]);
  const differs = all.gpa != null && cgpa != null && Math.abs(all.gpa - cgpa) > 0.01;

  const table = (rows: Row[], s: number | 'p', title: string) => {
    const t = courseTotals(graded(rows));
    return (
      <div className="overflow-x-auto rounded-lg border border-line">
        <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2">
          <span className="text-sm font-semibold text-navy">{title}</span>
          {s !== 'p' && s === semesters.length - 1 && semesters.length > 2 && (
            <button type="button" className="text-xs text-red-700" onClick={() => setSemesters((all) => all.slice(0, -1))}>Remove semester</button>
          )}
        </div>
        <table className="table min-w-[30rem] [&_td]:px-1.5 [&_th]:px-1.5">
          <thead><tr><th className="w-24">Code</th><th>Course title</th><th className="w-14">Credit</th><th className="w-16">Grade</th><th className="w-10 text-right">QP</th><th className="w-6" /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const gp = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }[r.grade];
              return (
                <tr key={i}>
                  <td><input value={r.code} onChange={(e) => edit(s, i, { code: e.target.value })} className="input py-1 font-mono text-xs uppercase" placeholder={s === 'p' ? 'ECO 899' : 'ECO 811'} aria-label="Course code" /></td>
                  <td><input value={r.title} onChange={(e) => edit(s, i, { title: e.target.value })} className="input py-1" placeholder={s === 'p' ? 'M.Sc. Dissertation' : 'Course title'} aria-label="Course title" /></td>
                  <td><input value={r.units} onChange={(e) => edit(s, i, { units: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="input py-1" aria-label="Credit" /></td>
                  <td>
                    <select value={r.grade} onChange={(e) => edit(s, i, { grade: e.target.value })} className="input py-1" aria-label="Grade">
                      <option value="">—</option>{GRADES.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="text-right tabular-nums">{gp != null && r.units ? Number(r.units) * gp : ''}</td>
                  <td><button type="button" onClick={() => remove(s, i)} className="text-muted hover:text-red-700" aria-label="Remove course">×</button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-sm">
              <td colSpan={2}><button type="button" onClick={() => add(s)} className="text-xs font-medium text-brand">+ Add {s === 'p' ? 'row' : 'course'}</button></td>
              <td className="font-semibold tabular-nums">{t.credits || ''}</td>
              <td className="text-xs text-muted">{s === 'p' ? '' : t.gpa != null ? `GPA ${t.gpa.toFixed(2)}` : ''}</td>
              <td className="text-right font-semibold tabular-nums">{t.credits ? t.points : ''}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ActionForm action={requestCourseResults.bind(null, recordId)} className="space-y-4">
        <p className="text-xs text-muted">
          Enter the courses as on the Student&rsquo;s Final Result sheet. Add a semester for students who spent three or four.
          Credit × grade point gives the quality point (A = 5 … F = 0).
        </p>
        {semesters.map((rows, s) => <div key={s}>{table(rows, s, `${ORD[s]} semester`)}</div>)}
        {semesters.length < 4 && (
          <button type="button" className="btn-outline text-sm" onClick={() => setSemesters((all) => [...all, [blank(), blank(), blank()]])}>
            + Add {ORD[semesters.length].toLowerCase()} semester
          </button>
        )}
        {table(project, 'p', 'Project / thesis / dissertation')}

        <div className={`rounded-lg p-3 text-sm ${differs ? 'bg-amber-50 text-amber-900' : 'bg-brand-soft text-navy'}`}>
          <b>Grand total:</b> {all.credits} credits · {all.points} quality points
          {all.gpa != null && <> · <b>FCGPA {all.gpa.toFixed(2)}</b> (TQP / TC)</>}
          {differs && <div className="mt-1 text-xs">The recorded FCGPA is {cgpa!.toFixed(2)}. Check the courses against the sheet; the recorded FCGPA is not changed by this form.</div>}
        </div>

        <input type="hidden" name="courses" value={JSON.stringify(payload)} />
        <div>
          <label className="label" htmlFor="cr-reason">Reason</label>
          <textarea id="cr-reason" name="reason" rows={2} required minLength={10} className="input"
            defaultValue="Course results entered from the Student's Final Result sheet." />
        </div>
        <input type="hidden" name="evidence" value={evidence} />
        <div className="text-sm">
          {evidence ? <span className="text-accent">✓ Result sheet attached</span> : <span className="text-muted">Attach the scanned result sheet below before sending.</span>}
        </div>
        <SubmitButton className="btn-dark">Send course results to Provost</SubmitButton>
      </ActionForm>
      <FileUploader purpose="AMENDMENT_EVIDENCE" recordId={recordId} multiple={false}
        label="Upload the Student's Final Result sheet (scan)"
        onUploaded={async (id) => { setEvidence(id); return { ok: true }; }} />
    </div>
  );
}
