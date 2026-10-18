'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadScan } from '@/components/FileUploader';
import type { ActionState } from '@/lib/action-state';

export type UploadTargetSheet = { id: string; reference: string; programme: string; matrics: string[] };
type Item = { file: File; target: string; status: 'ready' | 'uploading' | 'done' | 'error'; message?: string };

const ALL = '__all__';
const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

/**
 * Picks the sheet a scan belongs to from its file name: the sheet number (e.g. 000095 or
 * CPGS-RS-2026-000095), a graduand's registration number on the sheet, or the programme name.
 */
function matchSheet(name: string, sheets: UploadTargetSheet[]) {
  const base = name.replace(/\.[^.]+$/, '').toUpperCase();
  const runs: string[] = base.match(/\d+/g) ?? [];
  const bySerial = sheets.filter((s) => {
    const serial = s.reference.slice(-6);
    return runs.some((r) => r === serial || (/^\d{1,6}$/.test(base) && r.padStart(6, '0') === serial));
  });
  if (bySerial.length === 1) return bySerial[0].id;
  const regs: string[] = base.match(/\d{6,}[A-Z]{0,3}/g) ?? [];
  const byReg = sheets.filter((s) => s.matrics.some((m) => regs.includes(m)));
  if (byReg.length === 1) return byReg[0].id;
  const byName = sheets.filter((s) => letters(s.programme).length > 5 && letters(base).includes(letters(s.programme)));
  if (byName.length === 1) return byName[0].id;
  return '';
}

/**
 * Uploads many scans at once and attaches each to its sheet. Files are matched to sheets by name
 * and can be changed before uploading; "all sheets still being indexed" attaches one file (such as
 * a scanned PG Board list) to every sheet in the box that is still being indexed.
 */
export function BulkScanUploader({ sheets, attach }: {
  sheets: UploadTargetSheet[];
  attach: (fileId: string, sheetIds: string[]) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const counts = useMemo(() => ({
    matched: items.filter((i) => i.target).length,
    done: items.filter((i) => i.status === 'done').length,
    failed: items.filter((i) => i.status === 'error').length,
  }), [items]);

  const choose = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name));
    setItems(list.map((file) => ({ file, target: matchSheet(file.name, sheets), status: 'ready' })));
  };
  const setTarget = (i: number, target: string) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, target } : x)));
  const setAll = (target: string) => setItems((cur) => cur.map((x) => (x.status === 'done' ? x : { ...x, target })));

  async function start() {
    setBusy(true);
    const queue = items.map((x, i) => ({ ...x, i })).filter((x) => x.target && x.status !== 'done');
    const update = (i: number, patch: Partial<Item>) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    // Three uploads at a time: fast enough for hundreds of scans without overwhelming the connection.
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const ids = next.target === ALL ? sheets.map((s) => s.id) : [next.target];
        update(next.i, { status: 'uploading', message: undefined });
        try {
          if (next.file.size > 50 * 1024 * 1024) throw new Error('File is larger than 50 MB');
          const { id } = await uploadScan(next.file, 'LEGACY_SCAN', { sheetId: ids[0] });
          const res = await attach(id, ids);
          if (res.ok === false) throw new Error(res.message);
          update(next.i, { status: 'done', message: res.message });
        } catch (e) {
          update(next.i, { status: 'error', message: (e as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    router.refresh();
  }

  if (!sheets.length) return <p className="text-sm text-muted">No sheets in this box are being indexed, so there is nothing to attach scans to.</p>;
  return (
    <div className="space-y-3">
      <label className="block rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm hover:border-brand">
        <span className="font-medium text-navy">Choose scans</span>
        <span className="block text-xs text-muted">PDF, JPG or PNG, up to 50 MB each. You can select hundreds at once.</span>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="sr-only" disabled={busy}
          onChange={(e) => { choose(e.target.files); e.target.value = ''; }} />
      </label>
      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{items.length} file(s) · {counts.matched} matched to a sheet{counts.done ? ` · ${counts.done} attached` : ''}{counts.failed ? ` · ${counts.failed} failed` : ''}</span>
            <select className="input w-auto py-1 text-xs" value="" disabled={busy} onChange={(e) => e.target.value && setAll(e.target.value)}>
              <option value="">Set every file to…</option>
              <option value={ALL}>All {sheets.length} sheets still being indexed</option>
              {sheets.map((s) => <option key={s.id} value={s.id}>{s.reference.slice(-6)} · {s.programme}</option>)}
            </select>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-auto rounded-md border border-line">
            {items.map((it, i) => (
              <li key={`${it.file.name}-${i}`} className="grid grid-cols-1 gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate" title={it.file.name}>{it.file.name}</div>
                  <div className={`text-xs ${it.status === 'error' ? 'text-red-700' : it.status === 'done' ? 'text-accent' : 'text-muted'}`}>
                    {it.status === 'uploading' ? 'Uploading…' : it.status === 'done' ? `✓ ${it.message ?? 'Attached'}` : it.status === 'error' ? it.message
                      : it.target ? 'Ready' : 'No sheet matched: choose one, or it is skipped'}
                  </div>
                </div>
                <select className="input py-1.5 text-sm" value={it.target} disabled={busy || it.status === 'done'} onChange={(e) => setTarget(i, e.target.value)}
                  aria-label={`Sheet for ${it.file.name}`}>
                  <option value="">— skip this file —</option>
                  <option value={ALL}>All {sheets.length} sheets still being indexed</option>
                  {sheets.map((s) => <option key={s.id} value={s.id}>{s.reference.slice(-6)} · {s.programme}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy || !items.some((x) => x.target && x.status !== 'done')} onClick={start}>
              {busy ? `Uploading… ${counts.done}/${counts.matched}` : `Upload and attach ${items.filter((x) => x.target && x.status !== 'done').length} file(s)`}
            </button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setItems([])}>Clear list</button>
          </div>
        </>
      )}
      <p className="text-xs text-muted">
        Name scans after their sheet (e.g. <span className="font-mono">000095.pdf</span> or <span className="font-mono">CPGS-RS-2026-000095.pdf</span>),
        after a graduand&apos;s reg. number, or after the programme, and they are matched automatically.
      </p>
    </div>
  );
}
