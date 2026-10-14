import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { fmtBytes, fmtDate, fmtDateTime } from '@/lib/format';
import { cloudinaryUsage, isLinked, linksFor, reconcileWithCloudinary } from '@/lib/files';
import { storageDriver } from '@/lib/storage';
import { Amendment, Department, GraduandRecord, ResultSheet, StoredFile } from '@/models';
import { FILE_PURPOSES } from '@/models/StoredFile';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton, Pagination, StatCard } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { OpenFileButtons, VerifyButton } from './FileButtons';
import { deleteFile, deleteOrphanAsset, verifyFile } from './actions';

export const metadata: Metadata = { title: 'File storage' };

const PAGE = 25;
const PURPOSE_LABEL: Record<string, string> = {
  LEGACY_SCAN: 'Legacy scan', SUBMISSION_SCAN: 'Submission scan', AMENDMENT_EVIDENCE: 'Amendment evidence',
};

type Row = {
  _id: Types.ObjectId; storage: string; publicId: string; originalName?: string; format?: string; bytes?: number; pages?: number;
  sha256: string; purpose: string; createdAt: Date; backedUpAt?: Date;
  uploadedBy?: { name: string }; department?: { name: string; code: string };
};

export default function FilesPage(props: PageProps<'/admin/files'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FilesPageContent {...props} />
    </Suspense>
  );
}

async function FilesPageContent({ searchParams }: PageProps<'/admin/files'>) {
  const user = await requirePage('files:read');
  const sp = (await searchParams) as Record<string, string | undefined>;
  await db();
  const driver = storageDriver();
  const canManage = can(user.role, 'files:manage');
  const canDelete = can(user.role, 'files:delete');

  // Files that something points at; everything else is "unlinked" and may be cleaned up.
  const [sheetFiles, recordFiles, evidenceFiles] = await Promise.all([
    ResultSheet.distinct('files'), GraduandRecord.distinct('sourceFile'), Amendment.distinct('evidence'),
  ]);
  const linkedIds = [...new Set([...sheetFiles, ...recordFiles, ...evidenceFiles].filter(Boolean).map(String))];

  const filter: Record<string, unknown> = {};
  const q = sp.q?.trim().slice(0, 100);
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [{ originalName: rx }, { publicId: rx }, ...(/^[a-f0-9]{6,64}$/i.test(q) ? [{ sha256: { $regex: `^${q.toLowerCase()}` } }] : [])];
  }
  if (sp.purpose && (FILE_PURPOSES as readonly string[]).includes(sp.purpose)) filter.purpose = sp.purpose;
  if (sp.department) filter.department = sp.department;
  if (sp.storage === 'cloudinary' || sp.storage === 'local') filter.storage = sp.storage;
  if (sp.linked === 'yes') filter._id = { $in: linkedIds };
  if (sp.linked === 'no') filter._id = { $nin: linkedIds };
  if (sp.backup === 'no') filter.backedUpAt = null;
  if (sp.backup === 'yes') filter.backedUpAt = { $ne: null };

  const page = Math.max(1, parseInt(sp.page ?? '1') || 1);
  const [total, rows, totals, departments, usage, check] = await Promise.all([
    StoredFile.countDocuments(filter),
    StoredFile.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE)
      .populate('uploadedBy', 'name').populate('department', 'name code').lean<Row[]>(),
    StoredFile.aggregate<{ _id: null; n: number; bytes: number; local: number; notBacked: number }>([
      { $group: {
        _id: null, n: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$bytes', 0] } },
        local: { $sum: { $cond: [{ $eq: ['$storage', 'local'] }, 1, 0] } },
        notBacked: { $sum: { $cond: [{ $ifNull: ['$backedUpAt', false] }, 0, 1] } },
      } },
    ]),
    Department.find().sort({ name: 1 }).select('name').lean(),
    cloudinaryUsage(),
    sp.check === '1' && canManage && driver === 'cloudinary'
      ? reconcileWithCloudinary().catch((e: Error) => ({ error: e.message }))
      : Promise.resolve(null),
  ]);
  const links = await linksFor(rows.map((r) => r._id));
  const t = totals[0] ?? { n: 0, bytes: 0, local: 0, notBacked: 0 };
  const unlinked = t.n - (await StoredFile.countDocuments({ _id: { $in: linkedIds } }));

  const qs = (extra: Record<string, string | number>) =>
    '?' + new URLSearchParams({
      ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== 'page' && k !== 'check')) as Record<string, string>,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    }).toString();

  return (
    <>
      <PageHeader
        title="File storage"
        description="Every scan and evidence file held by the repository: search, open, verify and clean up without the Cloudinary dashboard. Files attached to a sheet, record or amendment are legal sources and cannot be deleted."
        actions={canManage && driver === 'cloudinary'
          ? <Link href={`/admin/files${qs({ check: 1 })}`} className="btn-outline">Run storage check</Link> : null}
      />

      {driver === 'unconfigured' && (
        <div className="mb-6"><Alert tone="danger">File storage is not configured on this server: uploads are disabled. Add the Cloudinary keys to the deployment environment.</Alert></div>
      )}
      {driver === 'cloudinary' && t.local > 0 && (
        <div className="mb-6"><Alert tone="warning">
          {t.local} file(s) were saved to temporary server storage before Cloudinary was configured and may no longer be readable.
          {' '}<Link className="link" href="/admin/files?storage=local">Show them</Link> and ask the uploaders to re-upload.
        </Alert></div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Files" value={t.n.toLocaleString()} tone="navy" hint={`${fmtBytes(t.bytes)} recorded`} />
        <StatCard label="Unlinked" value={unlinked} tone={unlinked ? 'danger' : 'accent'} href="/admin/files?linked=no" hint="Not attached to anything" />
        <StatCard label="Awaiting backup" value={t.notBacked} tone="brand" href="/admin/files?backup=no" hint="Not yet copied to the second store" />
        <StatCard
          label="Cloudinary storage"
          value={usage ? fmtBytes(usage.usedBytes) : driver === 'cloudinary' ? '—' : 'Not in use'}
          tone="accent"
          hint={usage
            ? [usage.storagePercent != null ? `${usage.storagePercent}% of storage` : null,
               usage.creditsPercent != null ? `${usage.creditsPercent}% of monthly credits` : null,
               usage.plan ? `${usage.plan} plan` : null].filter(Boolean).join(' · ')
            : driver === 'local' ? 'Local disk (development)' : undefined}
        />
      </div>

      {check && (
        <Card title="Storage check: Cloudinary vs file register" className="mb-6">
          {'error' in check ? <Alert tone="danger">Could not list Cloudinary assets: {check.error}</Alert> : (
            <>
              <p className="mb-3 text-sm text-muted">
                Scanned {check.scanned} private asset(s) in the <span className="font-mono">crr/</span> folder{check.truncated ? ' (first 5,000 per type only)' : ''}.
                {' '}{check.orphans.length ? `${check.orphans.length} have no record in the repository, usually uploads interrupted before they were registered.` : 'Every asset is registered.'}
              </p>
              {check.orphans.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Cloudinary path</th><th>Size</th><th>Uploaded</th><th /></tr></thead>
                    <tbody>
                      {check.orphans.map((o) => (
                        <tr key={o.publicId}>
                          <td className="font-mono text-xs break-all">{o.publicId}.{o.format}</td>
                          <td className="text-xs">{fmtBytes(o.bytes)}</td>
                          <td className="text-xs">{fmtDateTime(o.createdAt)}</td>
                          <td className="text-right">
                            {canDelete ? (
                              <ActionForm action={deleteOrphanAsset.bind(null, o.publicId, o.resourceType)} confirm="Permanently delete this unregistered asset from Cloudinary?" className="flex justify-end gap-2">
                                <input name="reason" required minLength={5} placeholder="Reason" className="input w-40 py-1 text-xs" />
                                <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">Delete</SubmitButton>
                              </ActionForm>
                            ) : <span className="text-xs text-muted">Administrator can delete</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <form className="card mb-6 grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-7" role="search">
        <input name="q" defaultValue={sp.q} placeholder="File name, path or checksum" aria-label="Search files" className="input sm:col-span-3 lg:col-span-2" />
        <select name="purpose" defaultValue={sp.purpose ?? ''} aria-label="Purpose" className="input">
          <option value="">Any purpose</option>
          {FILE_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
        </select>
        <select name="department" defaultValue={sp.department ?? ''} aria-label="Department" className="input">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d._id.toString()} value={d._id.toString()}>{d.name}</option>)}
        </select>
        <select name="linked" defaultValue={sp.linked ?? ''} aria-label="Linked" className="input">
          <option value="">Linked or not</option><option value="yes">Linked</option><option value="no">Unlinked</option>
        </select>
        <select name="storage" defaultValue={sp.storage ?? ''} aria-label="Storage" className="input">
          <option value="">Any storage</option><option value="cloudinary">Cloudinary</option><option value="local">Temporary / local</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>

      <Card title={`${total.toLocaleString()} file${total === 1 ? '' : 's'}`} bodyClass="p-0">
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>File</th><th>Purpose and unit</th><th>Attached to</th><th>Uploaded</th><th>Integrity</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {rows.map((f) => {
                    const id = f._id.toString();
                    const l = links.get(id)!;
                    const linked = isLinked(l);
                    const lost = f.storage === 'local' && driver !== 'local';
                    return (
                      <tr key={id} className="align-top">
                        <td>
                          <div className="font-medium text-navy">{f.originalName ?? 'file'}</div>
                          <div className="text-xs text-muted">{(f.format ?? '').toUpperCase()} · {fmtBytes(f.bytes)}{f.pages ? ` · ${f.pages} page(s)` : ''}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={f.storage === 'cloudinary' ? 'brand' : lost ? 'danger' : 'neutral'}>{f.storage === 'cloudinary' ? 'Cloudinary' : lost ? 'Lost: re-upload' : 'Local disk'}</Badge>
                          </div>
                        </td>
                        <td>
                          <div>{PURPOSE_LABEL[f.purpose] ?? f.purpose}</div>
                          <div className="text-xs text-muted">{f.department?.name ?? '—'}</div>
                        </td>
                        <td className="text-xs">
                          {linked ? (
                            <div className="space-y-0.5">
                              {l.sheets.map((s) => <div key={s.id}><Link className="link font-mono" href={`/sheets/${s.id}`}>{s.reference}</Link></div>)}
                              {l.records > 0 && <div className="text-muted">{l.records} graduand row(s) read from it</div>}
                              {l.amendments.map((a) => <div key={a.id}><Link className="link" href={`/records/${a.record}`}>Amendment evidence</Link> <span className="text-muted">({a.status.toLowerCase()})</span></div>)}
                            </div>
                          ) : <Badge tone="warning">Unlinked</Badge>}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {fmtDate(f.createdAt)}
                          <div className="text-muted">{f.uploadedBy?.name ?? '—'}</div>
                        </td>
                        <td className="text-xs">
                          <div className="font-mono text-muted" title={f.sha256}>{f.sha256.slice(0, 12)}…</div>
                          <div className="text-muted">{f.backedUpAt ? `Backed up ${fmtDate(f.backedUpAt)}` : 'Not backed up yet'}</div>
                        </td>
                        <td className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            {!lost && <OpenFileButtons fileId={id} />}
                            {canManage && !lost && <VerifyButton action={verifyFile.bind(null, id)} />}
                            {canDelete && !linked && (
                              <details className="text-left">
                                <summary className="cursor-pointer text-xs text-red-700">Delete</summary>
                                <ActionForm action={deleteFile.bind(null, id)} confirm="Permanently delete this file from storage?" className="mt-1 w-56 space-y-1">
                                  <input name="reason" required minLength={5} placeholder="Reason, e.g. duplicate upload" className="input py-1 text-xs" />
                                  <SubmitButton className="btn-danger w-full px-2 py-1 text-xs" pendingText="Deleting…">Delete permanently</SubmitButton>
                                </ActionForm>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => `/admin/files${qs({ page: p })}`} />
          </>
        ) : <EmptyState title="No files match">Uploaded scans and evidence appear here.</EmptyState>}
      </Card>
    </>
  );
}
