'use client';

import { useEffect, useState } from 'react';

type FileInfo = { id: string; name: string };
type Loaded = { id: string; url?: string; kind?: string; error?: string };

/** Fetches a 5-minute signed link (audited server-side) and shows the scan in-app. */
export function ScanViewer({ files, initial, height = 'h-[70vh]' }: { files: FileInfo[]; initial?: string; height?: string }) {
  const [active, setActive] = useState(initial ?? files[0]?.id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/files/${active}/url`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? 'Could not open file'))))
      .then((d) => { if (!cancelled) setLoaded({ id: active, url: d.url, kind: d.format }); })
      .catch((e) => { if (!cancelled) setLoaded({ id: active, error: e.message }); });
    return () => { cancelled = true; };
  }, [active]);

  if (!files.length) {
    return <div className={`flex ${height} items-center justify-center rounded-md border border-dashed border-line bg-slate-50 text-sm text-muted`}>No scan attached yet</div>;
  }

  const current = loaded?.id === active ? loaded : null;

  return (
    <div className="flex flex-col gap-2">
      {files.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <button key={f.id} onClick={() => setActive(f.id)}
              className={`rounded px-2 py-1 text-xs ${f.id === active ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {i + 1}. {f.name}
            </button>
          ))}
        </div>
      )}
      <div className={`${height} overflow-hidden rounded-md border border-line bg-slate-100`}>
        {!current && <div className="flex h-full items-center justify-center text-sm text-muted">Opening secure link…</div>}
        {current?.error && <div className="flex h-full items-center justify-center text-sm text-red-700">{current.error}</div>}
        {current?.url && (current.kind === 'pdf'
          ? <iframe src={current.url} title="Scanned result sheet" className="h-full w-full" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={current.url} alt="Scanned result sheet" className="h-full w-full object-contain" />)}
      </div>
      <p className="text-xs text-muted">Secure link expires after 5 minutes. Every view is recorded in the audit log.</p>
    </div>
  );
}
