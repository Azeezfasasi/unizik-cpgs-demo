'use client';

import { useState, useTransition } from 'react';
import type { ActionState } from '@/lib/action-state';

/** Opens (or downloads) a stored file through the audited, 5-minute signed link. */
export function OpenFileButtons({ fileId }: { fileId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(download: boolean) {
    setError(null);
    setBusy(true);
    // Open the tab synchronously (inside the click) so pop-up blockers allow it, then point it at the file.
    const tab = download ? null : window.open('', '_blank');
    try {
      const r = await fetch(`/api/files/${fileId}/url`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'Could not open file');
      const url = download ? `${d.url}&download=1` : d.url;
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => open(false)} className="text-xs link">Open</button>
        <button type="button" disabled={busy} onClick={() => open(true)} className="text-xs link">Download</button>
      </span>
      {error && <span className="max-w-56 text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** Runs the integrity check and shows the result inline. */
export function VerifyButton({ action }: { action: () => Promise<ActionState> }) {
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await action()))} className="text-xs link">
        {pending ? 'Checking…' : 'Verify'}
      </button>
      {state?.message && (
        <span className={`max-w-56 text-right text-xs ${state.ok ? 'text-accent' : 'text-red-700'}`}>{state.message}</span>
      )}
    </span>
  );
}
