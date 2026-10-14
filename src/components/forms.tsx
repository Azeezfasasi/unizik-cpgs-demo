'use client';

import { createContext, use, useActionState, useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/action-state';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext<boolean | null>(null);

/**
 * A form bound to a server action that shows its success or error message inline.
 * Submits through a transition so React does not clear the fields when validation fails.
 */
export function ActionForm({ action, children, className, resetOnSuccess = false, successMessage, confirm }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean;
  successMessage?: string; confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    // A full page load (not a client navigation) after account set-up steps, so no page
    // cached in the browser under the old account state can be replayed.
    const target = state.ok ? state.data?.redirect : undefined;
    if (target?.startsWith('/') && !target.startsWith('//')) window.location.assign(target);
  }, [state, resetOnSuccess]);

  return (
    <PendingContext value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        <FormMessage state={state} successMessage={successMessage} />
      </form>
    </PendingContext>
  );
}

export function FormMessage({ state, successMessage }: { state: ActionState; successMessage?: string }) {
  if (state.ok === undefined) return null;
  const msg = state.message ?? (state.ok ? successMessage : undefined);
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {msg && (
        <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? 'bg-accent-soft text-accent' : 'bg-red-50 text-red-700'}`}>{msg}</p>
      )}
      {state.ok && state.data?.download?.startsWith('/') && (
        <div className="flex flex-wrap gap-2">
          <a href={state.data.download} className="btn-primary py-1.5 text-sm">Download PDF</a>
          {state.data.view?.startsWith('/') && (
            <a href={state.data.view} target="_blank" rel="noreferrer" className="btn-outline py-1.5 text-sm">View</a>
          )}
        </div>
      )}
      {state.data?.apiKey && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          API key (shown once, store it securely):
          <code className="mt-1 block rounded bg-white px-2 py-1 font-mono text-xs font-semibold break-all text-navy select-all">{state.data.apiKey}</code>
        </div>
      )}
      {state.data?.tempPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Temporary password (shown once): <code className="ml-1 rounded bg-white px-2 py-0.5 font-mono font-semibold text-navy select-all">{state.data.tempPassword}</code>
        </div>
      )}
      {!!state.warnings?.length && (
        <ul className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {!!state.errors?.length && (
        <div className="max-h-72 overflow-auto rounded-md border border-red-200">
          <table className="table">
            <thead><tr><th>Sheet</th><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
            <tbody>
              {state.errors.map((e, i) => (
                <tr key={i}><td>{e.sheet}</td><td>{e.row || '—'}</td><td>{e.column}</td><td className="text-red-700">{e.message}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SubmitButton({ children, className = 'btn-primary', pendingText = 'Working…', name, value }: {
  children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string;
}) {
  const ctx = use(PendingContext);
  const status = useFormStatus();
  const pending = ctx ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? pendingText : children}
    </button>
  );
}
