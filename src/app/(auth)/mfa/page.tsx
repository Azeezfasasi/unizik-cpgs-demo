import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { MfaEnrol } from './MfaEnrol';

export const metadata: Metadata = { title: 'Two-step verification' };

export default function MfaPage() {
  return (
    <div className="card p-8">
      <Suspense fallback={<div className="h-80 animate-pulse rounded bg-slate-100" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireUser({ allowSetup: true });
  if (user.mustChangePassword) redirect('/setup/password');
  if (user.mfaEnabled && user.mfaPassed) redirect('/dashboard');
  return (
    <>
      <h1 className="text-xl font-semibold text-navy">Set up two-step verification</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Staff accounts with access to academic records must use an authenticator app
        (Google Authenticator, Microsoft Authenticator or similar) in addition to a password.
      </p>
      <MfaEnrol />
    </>
  );
}
