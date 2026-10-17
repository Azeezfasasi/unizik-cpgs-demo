'use client';

import { useState } from 'react';
import { ActionForm, SubmitButton } from './forms';
import { SheetTable, type SheetRow } from './SheetTable';
import type { ActionState } from '@/lib/action-state';

/**
 * A sheet list with a checkbox per row and one action for the selected sheets (e.g. pass QA,
 * lock). `confirm` adds a required attestation checkbox; `option` an optional one. The form stays
 * mounted when the list refreshes or empties, so the result of the action stays visible.
 */
export function BulkSheetForm({ rows, empty, action, submitLabel, pendingText, confirm, option, showDept = true }: {
  rows: SheetRow[]; empty: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string; pendingText: string;
  confirm?: { name: string; label: string };
  option?: { name: string; label: string };
  showDept?: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Only sheets still in the list count (a refresh after the action removes the processed ones).
  const selected = new Set(rows.filter((r) => picked.has(r.id)).map((r) => r.id));
  const all = rows.length > 0 && selected.size === rows.length;

  return (
    <ActionForm action={action} className="[&>[aria-live]]:px-5 [&>[aria-live]]:pb-4">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={all}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
            Select all {rows.length}
          </label>
          <span className="text-muted">{selected.size} selected</span>
        </div>
      )}
      <SheetTable rows={rows} empty={empty} showDept={showDept} selectName="ids" selected={selected}
        onSelect={(id, on) => setPicked((cur) => { const next = new Set(cur); if (on) next.add(id); else next.delete(id); return next; })} />
      {rows.length > 0 && (
        <div className="space-y-2 border-t border-line px-5 py-4">
          {confirm && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={confirm.name} required className="mt-1 accent-brand" />
              <span>{confirm.label}</span>
            </label>
          )}
          {option && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={option.name} className="mt-1 accent-brand" />
              <span>{option.label}</span>
            </label>
          )}
          <SubmitButton pendingText={pendingText}>{submitLabel}{selected.size ? ` (${selected.size})` : ''}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
