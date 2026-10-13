'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { FileUploader } from '@/components/FileUploader';
import { CLASS_LABELS, CLASS_OF_DEGREE, PROJECT_OPTIONS } from '@/lib/grading';
import { requestAmendment } from '../../amendments/actions';

type Current = Record<'cgpa' | 'classOfDegree' | 'thesisTitle' | 'supervisor' | 'senateApprovalDate' | 'remarks'
  | 'projectGrade' | 'effectiveDate' | 'boardMeeting', string>;

export function AmendmentForm({ recordId, current }: { recordId: string; current: Current }) {
  const [evidence, setEvidence] = useState('');

  return (
    <div className="space-y-4">
      <ActionForm action={requestAmendment.bind(null, recordId)} className="space-y-3">
        <p className="text-xs text-muted">Edit only the values that are wrong. Unchanged fields are ignored.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="a-cgpa">CGPA</label>
            <input id="a-cgpa" name="cgpa" type="number" step="0.01" min="0" max="5" defaultValue={current.cgpa} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="a-class">Class of degree</label>
            <select id="a-class" name="classOfDegree" defaultValue={current.classOfDegree} className="input">
              {CLASS_OF_DEGREE.map((c) => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-thesis">Thesis title</label>
            <input id="a-thesis" name="thesisTitle" defaultValue={current.thesisTitle} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="a-sup">Supervisor</label>
            <input id="a-sup" name="supervisor" defaultValue={current.supervisor} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="a-senate">Senate approval date</label>
            <input id="a-senate" name="senateApprovalDate" type="date" defaultValue={current.senateApprovalDate} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="a-project">Project grade</label>
            <select id="a-project" name="projectGrade" defaultValue={current.projectGrade} className="input">
              <option value="">—</option>
              {PROJECT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-wef">Effective date of graduation (WEF)</label>
            <input id="a-wef" name="effectiveDate" type="date" defaultValue={current.effectiveDate} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="a-board">PG Board meeting</label>
            <input id="a-board" name="boardMeeting" defaultValue={current.boardMeeting} className="input" placeholder="e.g. 63rd" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-remarks">Remarks</label>
            <input id="a-remarks" name="remarks" defaultValue={current.remarks} className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="a-reason">Reason for the correction</label>
          <textarea id="a-reason" name="reason" rows={3} required minLength={10} className="input" />
        </div>
        <input type="hidden" name="evidence" value={evidence} />
        <div className="text-sm">
          {evidence ? <span className="text-accent">✓ Evidence attached</span> : <span className="text-muted">Attach evidence below before sending.</span>}
        </div>
        <SubmitButton className="btn-dark">Send to Provost</SubmitButton>
      </ActionForm>
      <FileUploader purpose="AMENDMENT_EVIDENCE" recordId={recordId} multiple={false}
        label="Upload evidence (Senate extract, corrected signed sheet)"
        onUploaded={async (id) => { setEvidence(id); return { ok: true }; }} />
    </div>
  );
}
