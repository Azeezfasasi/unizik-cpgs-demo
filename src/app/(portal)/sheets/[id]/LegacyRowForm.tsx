'use client';

import { ActionForm, SubmitButton } from '@/components/forms';
import { CLASS_OF_DEGREE, CLASS_LABELS, PROJECT_OPTIONS } from '@/lib/grading';
import type { ActionState } from '@/lib/action-state';

export function LegacyRowForm({ action, files }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  files: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="matricNo">Matric no *</label>
          <input id="matricNo" name="matricNo" required className="input font-mono uppercase" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="surname">Surname *</label>
          <input id="surname" name="surname" required className="input uppercase" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="otherNames">Other names *</label>
          <input id="otherNames" name="otherNames" required className="input" autoComplete="off" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="sex">Sex</label>
          <select id="sex" name="sex" className="input"><option value="">—</option><option value="M">M</option><option value="F">F</option></select>
        </div>
        <div>
          <label className="label" htmlFor="cgpa">CGPA (FCGPA)</label>
          <input id="cgpa" name="cgpa" type="number" step="0.01" min="0" max="5" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="classOfDegree">Class of degree</label>
          <select id="classOfDegree" name="classOfDegree" className="input">
            <option value="">Work out from the CGPA</option>
            {CLASS_OF_DEGREE.map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <legend className="label mb-1">Semester GPAs and project (as on the PG Board result list)</legend>
        {[1, 2, 3, 4].map((n) => (
          <div key={n}>
            <label className="text-xs text-muted" htmlFor={`sem${n}`}>{['1st', '2nd', '3rd', '4th'][n - 1]} sem.</label>
            <input id={`sem${n}`} name="semesterGpas" type="number" step="0.01" min="0" max="5" className="input" />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted" htmlFor="projectGrade">Project</label>
          <select id="projectGrade" name="projectGrade" className="input">
            <option value="">—</option>
            {PROJECT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="effectiveDate">Effective date of graduation (WEF)</label>
          <input id="effectiveDate" name="effectiveDate" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="boardMeeting">PG Board meeting</label>
          <input id="boardMeeting" name="boardMeeting" className="input" placeholder="e.g. 63rd" autoComplete="off" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="thesisTitle">Thesis title</label>
          <input id="thesisTitle" name="thesisTitle" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="supervisor">Supervisor</label>
          <input id="supervisor" name="supervisor" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="sourceFile">Read from scan</label>
          <select id="sourceFile" name="sourceFile" className="input">
            <option value="">—</option>
            {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sourcePage">Page</label>
          <input id="sourcePage" name="sourcePage" type="number" min="1" className="input" />
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-brand">Courses (optional)</summary>
        <textarea name="courses" rows={4} className="input mt-2 font-mono text-xs"
          placeholder={'One per line: CODE | Title | Units | Score | Grade | Semester\nAEX801 | Research Methods | 3 | 72 | A | 1'} />
      </details>
      <div>
        <label className="label" htmlFor="remarks">Remarks</label>
        <input id="remarks" name="remarks" className="input" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="illegible" className="mt-1 accent-brand" />
        Part of this row is illegible: send to the Head of Records instead of guessing
      </label>
      <SubmitButton>Save row</SubmitButton>
    </ActionForm>
  );
}
