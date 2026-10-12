'use client';

import { useRef, useState } from 'react';
import type { ActionState } from '@/lib/action-state';

type Purpose = 'LEGACY_SCAN' | 'SUBMISSION_SCAN' | 'AMENDMENT_EVIDENCE';

async function sha256(file: File) {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function jsonOrThrow(r: Response) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((typeof d.error === 'string' ? d.error : d.error?.message) ?? `Upload failed (${r.status})`);
  return d;
}

/**
 * Uploads a scan: checksum in the browser, signed direct upload (Cloudinary) or local upload,
 * server-side registration, then hands the new file id to `onUploaded` (a server action).
 */
export async function uploadScan(file: File, purpose: Purpose, scope: { sheetId?: string; recordId?: string }) {
  const hash = await sha256(file);
  const sig = await fetch('/api/uploads/sign', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose, ...scope }),
  }).then(jsonOrThrow);

  if (sig.driver === 'local') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sha256', hash);
    fd.append('purpose', purpose);
    if (scope.sheetId) fd.append('sheetId', scope.sheetId);
    if (scope.recordId) fd.append("recordId", scope.recordId);
    return fetch('/api/uploads/local', { method: 'POST', body: fd }).then(jsonOrThrow) as Promise<{ id: string }>;
  }

  const fd = new FormData();
  Object.entries({
    file, api_key: sig.apiKey, timestamp: String(sig.timestamp), signature: sig.signature,
    folder: sig.folder, type: sig.type, context: sig.context, allowed_formats: sig.allowed_formats,
  }).forEach(([k, v]) => fd.append(k, v as Blob | string));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, { method: 'POST', body: fd }).then(jsonOrThrow);
  return fetch('/api/files', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      publicId: res.public_id, resourceType: res.resource_type, bytes: res.bytes, sha256: hash,
      originalName: file.name, purpose, ...scope,
    }),
  }).then(jsonOrThrow) as Promise<{ id: string }>;
}

export function FileUploader({ purpose, sheetId, recordId, onUploaded, label = 'Upload scans', multiple = true, accept = '.pdf,.jpg,.jpeg,.png' }: {
  purpose: Purpose; sheetId?: string; recordId?: string;
  onUploaded?: (fileId: string) => Promise<ActionState>;
  label?: string; multiple?: boolean; accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; msg?: string }[]>([]);
  const [drag, setDrag] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      setLog((l) => [...l, { name: f.name, status: 'uploading' }]);
      const update = (status: 'done' | 'error', msg?: string) =>
        setLog((l) => l.map((x) => (x.name === f.name && x.status === 'uploading' ? { ...x, status, msg } : x)));
      try {
        if (f.size > 50 * 1024 * 1024) throw new Error('File is larger than 50 MB');
        const { id } = await uploadScan(f, purpose, { sheetId, recordId });
        if (onUploaded) {
          const r = await onUploaded(id);
          if (r.ok === false) throw new Error(r.message);
        }
        update('done');
      } catch (e) {
        update('error', (e as Error).message);
      }
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          drag ? 'border-brand bg-brand-soft' : 'border-line bg-slate-50 hover:border-brand/50'}`}
      >
        <svg viewBox="0 0 20 20" className="mb-2 h-6 w-6 text-brand" fill="currentColor"><path d="M10 2l4.5 4.5-1.06 1.06-2.69-2.69V13h-1.5V4.87L6.56 7.56 5.5 6.5 10 2ZM3 14h1.5v2.5h11V14H17v4H3v-4Z" /></svg>
        <span className="text-sm font-medium text-navy">{label}</span>
        <span className="text-xs text-muted">PDF (PDF/A preferred), JPG or PNG, up to 50 MB. Drag and drop or click.</span>
        <input ref={input} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => handle(e.target.files)} />
      </label>
      {!!log.length && (
        <ul className="mt-2 space-y-1 text-xs">
          {log.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{l.name}</span>
              <span className={l.status === 'error' ? 'text-red-700' : l.status === 'done' ? 'text-accent' : 'text-muted'}>
                {l.status === 'uploading' ? 'Uploading…' : l.status === 'done' ? '✓ Saved' : l.msg}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
