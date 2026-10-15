import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/rbac';
import { fmtDateTime } from '@/lib/format';
import { AuditLog, Department, Faculty, User } from '@/models';
import { Badge, Card, DetailList, PageHeader, PageSkeleton } from '@/components/ui';

export const metadata: Metadata = { title: 'My account' };

/** Plain-English names for the actions people see most often in their own activity; others show their code. */
const ACTION_NAMES: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in attempt',
  'auth.password_changed': 'Changed password', 'auth.mfa_enrolled': 'Set up two-step verification',
  'record.view': 'Viewed a record', 'record.search': 'Searched records', 'record.export': 'Exported records',
  'sheet.view': 'Viewed a result sheet', 'sheet.submit': 'Submitted a result sheet', 'sheet.approve': 'Approved a result sheet',
  'sheet.return': 'Returned a result sheet', 'file.view': 'Opened a scan', 'file.upload': 'Uploaded a file',
  'document.issue': 'Issued a document', 'document.email': 'Emailed a document', 'document.download': 'Downloaded a document',
  'document.revoke': 'Revoked a document',
};

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountPageContent />
    </Suspense>
  );
}

async function AccountPageContent() {
  const user = await requireUser();
  await db();
  const [u, dept, fac, activity] = await Promise.all([
    User.findById(user.id).lean(),
    user.department ? Department.findById(user.department).lean() : null,
    user.faculty ? Faculty.findById(user.faculty).lean() : null,
    AuditLog.find({ actor: user.id }).sort({ seq: -1 }).limit(15).lean(),
  ]);

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <DetailList items={[
            ['Name', user.name],
            ['Email', user.email],
            ['Role', ROLE_LABELS[user.role]],
            ['Unit', dept?.name ?? fac?.name ?? 'University-wide'],
            ['Last sign-in', fmtDateTime(u?.lastLoginAt)],
            ['Account created', fmtDateTime(u?.createdAt)],
          ]} />
          <p className="mt-4 text-xs text-muted">To change your name, role or unit, contact the CPGS ICT unit.</p>
        </Card>
        <Card title="Security">
          <ul className="space-y-4 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>Password</span>
              <Link href="/setup/password" className="btn-outline py-1.5">Change password</Link>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Two-step verification</span>
              {user.mfaEnabled ? <Badge tone="success">Enabled</Badge> : <Link href="/mfa" className="btn-primary py-1.5">Set up now</Link>}
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">Lost your phone? Ask the ICT unit to reset your authenticator; you will enrol a new one at next sign-in.</p>
        </Card>
        <Card title="Your recent activity" className="lg:col-span-2" bodyClass="p-0">
          {/* Phones: a simple list; the table needs more width than a phone has. */}
          <ul className="divide-y divide-line md:hidden">
            {activity.map((a) => (
              <li key={a.seq} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-navy">{ACTION_NAMES[a.action] ?? a.action}</span>
                  <span className="shrink-0 text-xs text-muted">{fmtDateTime(a.at)}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-muted">{a.action}{a.ip ? ` · ${a.ip}` : ''}</div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.seq}>
                    <td className="text-xs whitespace-nowrap">{fmtDateTime(a.at)}</td>
                    <td className="text-xs">{ACTION_NAMES[a.action] ?? a.action}<div className="font-mono text-muted">{a.action}</div></td>
                    <td className="text-xs">{a.entity}</td>
                    <td className="font-mono text-xs text-muted">{a.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
