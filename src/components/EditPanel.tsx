import type { ReactNode } from 'react';
import type { ActionState } from '@/lib/action-state';
import { ActionForm, SubmitButton } from './forms';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * An expandable list row: the summary line opens an inline edit form with Save and Delete.
 * Delete is replaced by an explanation when the item is still referenced by other records.
 */
export function EditPanel({ summary, children, update, remove, inUse, itemLabel }: {
  summary: ReactNode; children: ReactNode; update: Action; remove: Action; inUse?: string; itemLabel: string;
}) {
  return (
    <details className="group rounded-md border border-transparent open:border-line open:bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="shrink-0 text-xs font-medium text-brand group-open:hidden">Edit</span>
        <span className="hidden shrink-0 text-xs text-muted group-open:inline">Close</span>
      </summary>
      <div className="space-y-3 px-2 pt-1 pb-3">
        <ActionForm action={update} className="space-y-2">
          {children}
          <SubmitButton className="btn-primary px-3 py-1.5 text-xs">Save changes</SubmitButton>
        </ActionForm>
        <div className="border-t border-line pt-3">
          {inUse ? (
            <p className="text-xs text-muted">
              <span className="font-medium text-navy">Cannot delete:</span> in use by {inUse}.
            </p>
          ) : (
            <ActionForm action={remove} confirm={`Delete ${itemLabel}? This cannot be undone.`}>
              <SubmitButton className="btn-danger px-3 py-1.5 text-xs" pendingText="Deleting…">Delete {itemLabel}</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </details>
  );
}
