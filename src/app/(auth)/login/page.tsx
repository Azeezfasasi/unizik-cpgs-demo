import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Staff sign in' };

export default function LoginPage() {
  return (
    <div className="card p-8">
      <h1 className="text-xl font-semibold text-navy">Staff sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Use your official university email address.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
