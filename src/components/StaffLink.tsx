import { Suspense } from 'react';
import Link from 'next/link';
import { readSession } from '@/lib/session';

/**
 * "Staff sign in", or "Go to dashboard" when the visitor already has a session. Only the signed
 * cookie is checked (no database read) so public pages stay fast; the dashboard does the full check.
 */
export function StaffLink({ className, signedOutLabel = 'Staff sign in' }: { className?: string; signedOutLabel?: string }) {
  const signIn = <Link href="/login" className={className}>{signedOutLabel}</Link>;
  return (
    <Suspense fallback={signIn}>
      <StaffLinkFor className={className} signIn={signIn} />
    </Suspense>
  );
}

async function StaffLinkFor({ className, signIn }: { className?: string; signIn: React.ReactNode }) {
  if (!(await readSession())) return signIn;
  return <Link href="/dashboard" className={className}>Go to dashboard</Link>;
}
