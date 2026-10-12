'use client';

import { ActionForm, SubmitButton } from '@/components/forms';
import { CLASS_OF_DEGREE, CLASS_LABELS } from '@/lib/grading';
import type { ActionState } from '@/lib/action-state';

export function LegacyRowForm({ action, files }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  files: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="sex">Sex</label>
          <select id="sex" name="sex" className="input"><option value="">—</option><option value="M">M</option><option value="F">F</option></select>
        </div>
        <div>
          <label className="label" htmlFor="cgpa">CGPA</label>
          <input id="cgpa" name="cgpa" type="number" step="0.01" min="0" max="5" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="classOfDegree">Class of degree *</label>
          <select id="classOfDegree" name="classOfDegree" required className="input">
            {CLASS_OF_DEGREE.map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="thesisTitle">Thesis title</label>
          <input id="thesisTitle" name="thesisTitle" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="supervisor">Supervisor</label>
          <input id="supervisor" name="supervisor" className="input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
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
          placeholder={'One per line: CODE | Title | Units | Score | Grade\nAEX801 | Research Methods | 3 | 72 | A'} />
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
