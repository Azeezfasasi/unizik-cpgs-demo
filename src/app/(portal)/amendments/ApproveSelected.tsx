'use client';

import { ActionForm, SubmitButton } from '@/components/forms';
import { approveSelectedAmendments } from './actions';

/**
 * "Approve selected" for the Provost. The tick boxes sit next to each pending amendment and join
 * this form through their `form` attribute.
 */
export function ApproveSelected({ count }: { count: number }) {
  const toggle = (on: boolean) => document.querySelectorAll<HTMLInputElement>('input[form="bulk-approve"][name="ids"]').forEach((b) => { b.checked = on; });
  return (
    <ActionForm id="bulk-approve" action={approveSelectedAmendments} className="flex flex-wrap items-center gap-3 border-b border-line bg-slate-50 px-5 py-3"
      confirm="Approve all the selected amendments? Each one creates a new record version.">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" onChange={(e) => toggle(e.target.checked)} /> Select all {count}
      </label>
      <SubmitButton className="btn-accent" pendingText="Approving…">Approve selected</SubmitButton>
      <span className="text-xs text-muted">Review each one first; requests you made yourself cannot be selected.</span>
    </ActionForm>
  );
}
