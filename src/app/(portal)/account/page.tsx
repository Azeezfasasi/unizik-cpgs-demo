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
      <div className="grid gap-6 lg:grid-cols-2">
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
            <li className="flex items-center justify-between">
              <span>Password</span>
              <Link href="/setup/password" className="btn-outline py-1.5">Change password</Link>
            </li>
            <li className="flex items-center justify-between">
              <span>Two-step verification</span>
              {user.mfaEnabled ? <Badge tone="success">Enabled</Badge> : <Link href="/mfa" className="btn-primary py-1.5">Set up now</Link>}
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">Lost your phone? Ask the ICT unit to reset your authenticator; you will enrol a new one at next sign-in.</p>
        </Card>
        <Card title="Your recent activity" className="lg:col-span-2" bodyClass="p-0">
          <table className="table">
            <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.seq}><td className="text-xs">{fmtDateTime(a.at)}</td><td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.entity}</td><td className="font-mono text-xs text-muted">{a.ip ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
