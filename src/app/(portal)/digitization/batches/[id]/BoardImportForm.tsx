'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import type { ActionState } from '@/lib/action-state';

type Session = { id: string; label: string };
type Choice = {
  uid: number; sheet: string; line: number; matricNo: string; name: string; group: string; department: string; degreeType: string;
  options: { id: string; name: string }[]; selected?: string;
};

/** Board list upload. When a department has several programmes of a type, asks which one per graduand. */
export function BoardImportForm({ action, boxSessions, otherSessions, canAddStructure }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  boxSessions: Session[]; otherSessions: Session[];
  /** Whether this user may add missing departments and programmes from the list. */
  canAddStructure: boolean;
}) {
  return (
    <ActionForm action={action} className="space-y-3" after={(state) => (state.data?.choices ? <ProgrammeChoices key={state.data.choices} json={state.data.choices} /> : null)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="board-file">Board list (.xlsx, .xls or .csv)</label>
          <input id="board-file" name="file" type="file" required accept=".xlsx,.xls,.csv" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="board-session">Session of the final defence</label>
          <select id="board-session" name="session" required className="input">
            <optgroup label="Sessions in this box">
              {boxSessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
            {otherSessions.length > 0 && (
              <optgroup label="Other sessions">
                {otherSessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      </div>
      {canAddStructure && (
        <label className="flex items-start gap-2 rounded-md border border-line bg-slate-50 p-3 text-sm">
          <input type="checkbox" name="addMissing" className="mt-1 accent-brand" />
          <span>
            <b>Add missing departments and programmes</b> to Academic structure from this list (FACULTY, DEPARTMENT and PROG.).
            Existing ones are never changed. Use Check only first to see exactly what would be added.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="mode" value="check" className="btn-outline" pendingText="Checking…">Check only</SubmitButton>
        <SubmitButton name="mode" value="import" pendingText="Importing…">Import</SubmitButton>
      </div>
      <p className="text-xs text-muted">
        Departments are matched by name and programmes by type (PHD, MSC, LLM…). If a department has several programmes
        of that type, you choose each graduand&apos;s programme here (AREA OF SPECIALIZATION is used when it names one).
        Every row is checked first; if anything does not match, nothing is saved. A SESSION column, if present, overrides the session above.
      </p>
    </ActionForm>
  );
}

function ProgrammeChoices({ json }: { json: string }) {
  const choices = JSON.parse(json) as Choice[];
  const [values, setValues] = useState<Record<number, string>>(() => Object.fromEntries(choices.filter((c) => c.selected).map((c) => [c.uid, c.selected!])));
  const groups = [...new Set(choices.map((c) => c.group))].map((g) => choices.filter((c) => c.group === g));

  return (
    <div className="space-y-4 rounded-md border border-amber-300 bg-amber-50/60 p-4">
      <p className="text-sm font-medium text-amber-900">Programme for each graduand</p>
      <p className="text-xs text-amber-900">These departments have several programmes of the same type. Pick each graduand&apos;s programme (or use Set all), then press Check only or Import.</p>
      {groups.map((rows) => {
        const first = rows[0];
        return (
          <div key={first.group} role="group" aria-label={`${first.department} ${first.degreeType}`} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-navy">
                {first.department} · {first.degreeType} <span className="font-normal text-muted">({rows.length} graduand{rows.length === 1 ? '' : 's'})</span>
              </h3>
              <select aria-label={`Set all ${first.department} ${first.degreeType} graduands to`} className="input w-auto py-1 text-xs" value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setValues((cur) => ({ ...cur, ...Object.fromEntries(rows.map((r) => [r.uid, v])) }));
                }}>
                <option value="">Set all to…</option>
                {first.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <ul className="divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
              {rows.map((r) => (
                <li key={r.uid} className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <div className="min-w-0 text-sm">
                    <span className="text-xs text-muted">{r.sheet} · row {r.line} · </span>
                    <span className="font-mono text-xs">{r.matricNo}</span>{' '}
                    <span className="text-navy">{r.name}</span>
                  </div>
                  <select name={`programme_${r.uid}`} required aria-label={`Programme for ${r.name}`} className="input py-1.5 text-sm"
                    value={values[r.uid] ?? ''} onChange={(e) => setValues((cur) => ({ ...cur, [r.uid]: e.target.value }))}>
                    <option value="">Choose programme…</option>
                    {r.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
