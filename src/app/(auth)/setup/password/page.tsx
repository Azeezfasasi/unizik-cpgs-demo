import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { changePassword } from '../../actions';

export const metadata: Metadata = { title: 'Change password' };

export default function PasswordPage() {
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
  return (
    <>
      <h1 className="text-xl font-semibold text-navy">{user.mustChangePassword ? 'Set your password' : 'Change password'}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {user.mustChangePassword
          ? 'Your account was created with a temporary password. Choose a new one to continue.'
          : 'Choose a strong password you do not use anywhere else.'}
      </p>
      <ActionForm action={changePassword} className="space-y-4">
        <div>
          <label className="label" htmlFor="current">{user.mustChangePassword ? 'Temporary password' : 'Current password'}</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="input" />
          <p className="mt-1 text-xs text-muted">At least 12 characters with upper and lower case letters and a number.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Save password</SubmitButton>
      </ActionForm>
    </>
  );
}
