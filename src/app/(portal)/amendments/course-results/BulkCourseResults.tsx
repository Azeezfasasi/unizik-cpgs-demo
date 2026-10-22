'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { uploadScan } from '@/components/FileUploader';
import { checkCourseResults, sendCourseResults } from '../actions';
import type { CoursePlanItem } from '@/lib/course-results-import';

type Scan = { file: File; status: 'uploading' | 'done' | 'error'; fileId?: string; message?: string };
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The student a scan belongs to: the longest Matric No found in its file name. */
function matchScan(name: string, plan: CoursePlanItem[]) {
  const base = norm(name.replace(/\.[^.]+$/, ''));
  const hits = plan.filter((p) => p.recordId && !p.problem && base.includes(norm(p.matricNo)));
  hits.sort((a, b) => b.matricNo.length - a.matricNo.length);
  return hits[0]?.matricNo;
}

/** Hands the checked plan from the form result to the page (renders nothing). */
function PlanSync({ json, onPlan }: { json: string; onPlan: (p: CoursePlanItem[]) => void }) {
  useEffect(() => onPlan(JSON.parse(json)), [json, onPlan]);
  return null;
}

/**
 * Bulk course results: check a spreadsheet, attach each student's scanned Final Result sheet
 * (matched by Matric No in the file name), then send one request per student to the Provost.
 */
export function BulkCourseResults() {
  const [plan, setPlan] = useState<CoursePlanItem[]>([]);
  const [scans, setScans] = useState<Record<string, Scan>>({});
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const onPlan = useCallback((p: CoursePlanItem[]) => {
    setPlan(p);
    setScans({});
    setUnmatched([]);
  }, []);

  const ready = plan.filter((p) => !p.problem);
  const attached = ready.filter((p) => scans[p.matricNo]?.status === 'done');
  const items = useMemo(() => JSON.stringify(attached.map((p) => ({
    recordId: p.recordId, evidence: scans[p.matricNo].fileId, courses: p.courses,
  }))), [attached, scans]);

  async function upload(entries: [string, File][]) {
    setBusy(true);
    setScans((cur) => ({ ...cur, ...Object.fromEntries(entries.map(([m, file]) => [m, { file, status: 'uploading' as const }])) }));
    const queue = [...entries];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [matric, file] = next;
        const recordId = plan.find((p) => p.matricNo === matric)!.recordId!;
        try {
          const { id } = await uploadScan(file, 'AMENDMENT_EVIDENCE', { recordId });
          setScans((cur) => ({ ...cur, [matric]: { file, status: 'done', fileId: id } }));
        } catch (e) {
          setScans((cur) => ({ ...cur, [matric]: { file, status: 'error', message: e instanceof Error ? e.message : 'Upload failed' } }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
  }

  function chooseMany(files: FileList | null) {
    if (!files?.length) return;
    const entries: [string, File][] = [];
    const missed: string[] = [];
    for (const f of [...files].filter((x) => /\.(pdf|jpe?g|png)$/i.test(x.name))) {
      const m = matchScan(f.name, plan);
      if (m && !entries.some(([x]) => x === m)) entries.push([m, f]);
      else missed.push(f.name);
    }
    setUnmatched(missed);
    if (entries.length) void upload(entries);
  }

  return (
    <div className="space-y-6">
      <ActionForm action={checkCourseResults} className="space-y-3"
        after={(s) => (s.data?.plan ? <PlanSync key={s.data.plan} json={s.data.plan} onPlan={onPlan} /> : null)}>
        <div>
          <label className="label" htmlFor="cr-file">Filled spreadsheet (.xlsx, .xls or .csv)</label>
          <input id="cr-file" name="file" type="file" required accept=".xlsx,.xls,.csv" className="input" />
        </div>
        <SubmitButton className="btn-outline" pendingText="Checking…">Check spreadsheet</SubmitButton>
      </ActionForm>

      {plan.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr><th>Matric no</th><th>Student</th><th>Courses</th><th className="text-right">FCGPA</th><th>Scan</th></tr>
              </thead>
              <tbody>
                {plan.map((p) => {
                  const s = scans[p.matricNo];
                  return (
                    <tr key={p.matricNo} className={p.problem ? 'bg-red-50/50' : ''}>
                      <td className="font-mono text-xs whitespace-nowrap">{p.matricNo}</td>
                      <td>
                        <div className="text-sm">{p.name ?? '—'}</div>
                        {p.degree && <div className="text-xs text-muted">{p.degree} · {p.session}</div>}
                        {p.problem && <div className="text-xs font-medium text-red-700">{p.problem}</div>}
                        {!p.problem && p.warning && <div className="text-xs text-amber-800">⚠ {p.warning}</div>}
                      </td>
                      <td className="text-xs whitespace-nowrap">{p.courses.length} courses · {p.semesters} sem.<div className="text-muted">{p.credits} credits · {p.points} QP</div></td>
                      <td className="text-right tabular-nums">{p.fcgpa?.toFixed(2) ?? '—'}{p.recordedCgpa != null && <div className="text-xs text-muted">record {p.recordedCgpa.toFixed(2)}</div>}</td>
                      <td className="text-xs">
                        {p.problem ? <span className="text-muted">Not sent</span>
                          : s?.status === 'done' ? <span className="text-accent">✓ {s.file.name}</span>
                          : s?.status === 'uploading' ? <span className="text-muted">Uploading…</span>
                          : (
                            <label className="cursor-pointer text-brand">
                              {s?.status === 'error' ? <span className="text-red-700">{s.message}. </span> : null}Choose file
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only"
                                onChange={(e) => e.target.files?.[0] && void upload([[p.matricNo, e.target.files[0]]])} />
                            </label>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ready.length > 0 && (
            <div className="space-y-3 rounded-lg border border-line p-4">
              <div>
                <label className="label" htmlFor="cr-scans">Attach the scanned result sheets</label>
                <input id="cr-scans" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="input" disabled={busy}
                  onChange={(e) => { chooseMany(e.target.files); e.target.value = ''; }} />
                <p className="mt-1 text-xs text-muted">
                  Select all the scans at once: each is matched to the student whose Matric No is in the file name (e.g. 2020116004FB.pdf).
                  Use &ldquo;Choose file&rdquo; in the table for any that do not match.
                </p>
                {unmatched.length > 0 && <p className="mt-1 text-xs text-amber-800">No student matched: {unmatched.join(', ')}</p>}
              </div>
              <ActionForm action={sendCourseResults} className="space-y-3">
                <input type="hidden" name="items" value={items} />
                <div>
                  <label className="label" htmlFor="cr-reason">Reason</label>
                  <textarea id="cr-reason" name="reason" rows={2} required minLength={10} className="input"
                    defaultValue="Course results entered from the Student's Final Result sheet." />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton className="btn-dark" pendingText="Sending…">
                    Send {attached.length} to Provost
                  </SubmitButton>
                  <span className="text-xs text-muted">
                    {attached.length} of {ready.length} ready student(s) have their scan attached. Only those are sent.
                  </span>
                </div>
              </ActionForm>
            </div>
          )}
        </>
      )}
    </div>
  );
}
