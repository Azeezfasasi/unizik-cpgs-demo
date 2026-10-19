import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, mfaRequired } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Staff sign in' };

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <div className="card p-8">
      <h1 className="text-xl font-semibold text-navy">Staff sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Use your official university email address.</p>
      <Suspense fallback={<div className="h-56" />}>
        <SignedOutOnly searchParams={searchParams}>
          <LoginForm />
        </SignedOutOnly>
      </Suspense>
    </div>
  );
}

/**
 * Someone already fully signed in is sent on to the dashboard (or the page they asked for) instead
 * of seeing the form. A half-finished sign-in (password change or second step pending) still sees it.
 */
async function SignedOutOnly({ searchParams, children }: { searchParams: PageProps<'/login'>['searchParams']; children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user && !user.mustChangePassword && (!mfaRequired() || user.mfaPassed)) {
    redirect(safeNext((await searchParams).next));
  }
  return children;
}
