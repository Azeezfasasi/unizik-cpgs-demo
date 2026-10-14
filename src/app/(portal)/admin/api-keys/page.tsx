import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { ROLE_LABELS, type Role } from '@/lib/rbac';
import { fmtDate, fmtDateTime } from '@/lib/format';
import ApiKey from '@/models/ApiKey';
import { User } from '@/models';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createApiKey, revokeApiKey } from './actions';

export const metadata: Metadata = { title: 'API & integrations' };

type Row = {
  _id: Types.ObjectId; name: string; keyId: string; expiresAt?: Date; revokedAt?: Date; lastUsedAt?: Date; lastUsedIp?: string;
  useCount: number; createdAt: Date; owner?: { name: string; email: string; role: Role; isActive: boolean }; createdBy?: { name: string };
};

export default function ApiKeysPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApiKeysContent />
    </Suspense>
  );
}

async function ApiKeysContent() {
  await requirePage('apikeys:manage');
  await db();
  const now = new Date();
  const [keys, users] = await Promise.all([
    ApiKey.find().sort({ revokedAt: 1, createdAt: -1 }).populate('owner', 'name email role isActive').populate('createdBy', 'name').lean<Row[]>(),
    User.find({ isActive: true }).sort({ role: 1, name: 1 }).select('name email role').lean(),
  ]);
  const status = (k: Row) =>
    k.revokedAt ? <Badge tone="danger">Revoked</Badge>
      : k.expiresAt && k.expiresAt < now ? <Badge>Expired</Badge>
        : k.owner && !k.owner.isActive ? <Badge tone="warning">Owner inactive</Badge>
          : <Badge tone="success">Active</Badge>;

  return (
    <>
      <PageHeader
        title="API & integrations"
        description="Keys let other university applications use the Results Repository API. A key acts as the staff account it belongs to, with exactly that account's role and department, so the approval chain and all safeguards still apply."
        actions={<a href="/api-docs" target="_blank" rel="noreferrer" className="btn-primary">Open API documentation</a>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_24rem]">
        <Card title={`${keys.length} key${keys.length === 1 ? '' : 's'}`} bodyClass="p-0">
          {keys.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Application</th><th>Acts as</th><th>Usage</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k._id.toString()} className={k.revokedAt ? 'opacity-60' : ''}>
                      <td>
                        <div className="font-medium text-navy">{k.name}</div>
                        <div className="font-mono text-xs text-muted">crr_{k.keyId}_…</div>
                        <div className="text-xs text-muted">Created {fmtDate(k.createdAt)} by {k.createdBy?.name ?? '—'}</div>
                      </td>
                      <td>
                        <div>{k.owner?.name ?? '—'}</div>
                        <div className="text-xs text-muted">{k.owner ? ROLE_LABELS[k.owner.role] : ''}</div>
                      </td>
                      <td className="text-xs">
                        <div>{k.useCount.toLocaleString()} request(s)</div>
                        <div className="text-muted">Last used {fmtDateTime(k.lastUsedAt)}{k.lastUsedIp ? ` from ${k.lastUsedIp}` : ''}</div>
                        <div className="text-muted">{k.expiresAt ? `Expires ${fmtDate(k.expiresAt)}` : 'No expiry'}</div>
                      </td>
                      <td>{status(k)}</td>
                      <td className="text-right">
                        {!k.revokedAt && (
                          <ActionForm action={revokeApiKey.bind(null, k._id.toString())} confirm={`Revoke "${k.name}"? Applications using it will stop working immediately.`}>
                            <SubmitButton className="text-xs text-red-700 hover:underline" pendingText="…">Revoke</SubmitButton>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No API keys yet">Create one for each application that needs access.</EmptyState>}
        </Card>

        <div className="space-y-6">
          <Card title="Create a key">
            <ActionForm action={createApiKey} className="space-y-3" resetOnSuccess>
              <div>
                <label className="label" htmlFor="name">Application name</label>
                <input id="name" name="name" required placeholder="e.g. Library clearance system" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="owner">Acts as account</label>
                <select id="owner" name="owner" required className="input">
                  <option value="">Choose a staff account…</option>
                  {users.map((u) => <option key={u._id.toString()} value={u._id.toString()}>{u.name} ({ROLE_LABELS[u.role as Role]})</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">For read-only integrations, create a dedicated account with the Internal Auditor role and use it here.</p>
              </div>
              <div>
                <label className="label" htmlFor="expiresInDays">Expires</label>
                <select id="expiresInDays" name="expiresInDays" defaultValue="365" className="input">
                  <option value="90">In 90 days</option><option value="365">In 1 year</option><option value="730">In 2 years</option><option value="0">Never</option>
                </select>
              </div>
              <SubmitButton className="btn-primary w-full">Create key</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Using a key">
            <p className="text-sm text-muted">Send it with every request:</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-navy p-3 text-xs text-slate-100">{`curl -H "Authorization: Bearer crr_…" \\
  ${process.env.APP_URL?.includes('localhost') ? 'https://unizik-cpgs.vercel.app' : process.env.APP_URL ?? 'https://unizik-cpgs.vercel.app'}/api/v1/me`}</pre>
            <div className="mt-3"><Alert tone="warning">Keys are shown once. Keep them on servers only, never in browser or mobile app code. Revoke a key immediately if it may have leaked.</Alert></div>
          </Card>
        </div>
      </div>
    </>
  );
}
