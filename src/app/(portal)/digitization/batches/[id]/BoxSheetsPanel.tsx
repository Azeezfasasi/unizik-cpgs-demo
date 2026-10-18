'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { SheetTable, type SheetRow } from '@/components/SheetTable';
import type { ActionState } from '@/lib/action-state';

/**
 * The box's result sheets with a checkbox per sheet: send the selected ones to QA, or download their
 * certified transcriptions as one PDF to print and sign in one go.
 */
export function BoxSheetsPanel({ rows, sendToQa }: {
  rows: SheetRow[];
  sendToQa: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selected = new Set(rows.filter((r) => picked.has(r.id)).map((r) => r.id));
  const all = rows.length > 0 && selected.size === rows.length;
  const pick = (ids: string[]) => setPicked(new Set(ids));
  const byStatus = (...st: string[]) => rows.filter((r) => st.includes(r.status)).map((r) => r.id);
  const draft = byStatus('DRAFT', 'RETURNED');

  return (
    <ActionForm action={sendToQa} className="[&>[aria-live]]:px-5 [&>[aria-live]]:pb-4">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={all} onChange={(e) => pick(e.target.checked ? rows.map((r) => r.id) : [])} />
            Select all {rows.length}
          </label>
          {draft.length > 0 && draft.length < rows.length && (
            <button type="button" className="link text-xs" onClick={() => pick(draft)}>Select the {draft.length} still being indexed</button>
          )}
          <span className="text-muted">{selected.size} selected</span>
        </div>
      )}
      <SheetTable rows={rows} empty="No sheets created from this box yet" showDept={false} selectName="ids" selected={selected}
        onSelect={(id, on) => setPicked((cur) => { const next = new Set(cur); if (on) next.add(id); else next.delete(id); return next; })} />
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          <SubmitButton pendingText="Sending…">Send selected to QA{selected.size ? ` (${selected.size})` : ''}</SubmitButton>
          {selected.size > 0 ? (
            <a className="btn-outline" href={`/api/sheets/signing-sheets?ids=${[...selected].join(',')}`}>
              Download certified transcriptions ({selected.size}, one PDF)
            </a>
          ) : <span className="btn-outline cursor-not-allowed opacity-50">Download certified transcriptions (one PDF)</span>}
          <p className="w-full text-xs text-muted">
            Sending to QA needs each sheet&apos;s scan attached and at least one graduand; others are skipped with the reason.
            The PDF has each selected sheet on its own pages, ready to print, sign and stamp.
          </p>
        </div>
      )}
    </ActionForm>
  );
}
