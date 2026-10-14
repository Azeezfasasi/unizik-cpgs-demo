'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dismissMfaPrompt } from '@/app/(auth)/actions';

/**
 * Reminder shown after sign-in to accounts without two-step verification. Either choice
 * closes it until the next sign-in; once two-step is set up it is never rendered.
 */
export function MfaPrompt() {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const primary = useRef<HTMLButtonElement>(null);

  const close = (then?: () => void) => {
    setOpen(false);
    startTransition(async () => {
      await dismissMfaPrompt();
      then?.();
    });
  };

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-4 sm:items-center" onClick={() => close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="mfa-prompt-title" aria-describedby="mfa-prompt-body"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <h2 id="mfa-prompt-title" className="text-lg font-semibold text-navy">Set up two-step verification</h2>
        <div id="mfa-prompt-body" className="mt-2 space-y-2 text-sm text-muted">
          <p>Your account gives access to academic records. Protect it with a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar) as well as your password.</p>
          <p>It takes about two minutes. You will be reminded each time you sign in until it is set up.</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-outline" onClick={() => close()} disabled={pending}>Not now</button>
          <button type="button" ref={primary} className="btn-primary" disabled={pending}
            onClick={() => close(() => router.push('/mfa'))}>Set up now</button>
        </div>
      </div>
    </div>
  );
}
