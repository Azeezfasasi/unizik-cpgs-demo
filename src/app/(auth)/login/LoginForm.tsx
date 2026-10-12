'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { login } from '../actions';
import { SubmitButton } from '@/components/forms';

export function LoginForm() {
  const next = useSearchParams().get('next') ?? '/dashboard';
  const [state, action] = useActionState(login, {});
  const otpStep = state.data?.step === 'otp';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className={otpStep ? 'hidden' : ''}>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="input" placeholder="name@unizik.edu.ng" />
      </div>
      <div className={otpStep ? 'hidden' : ''}>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="input" />
      </div>
      {otpStep && (
        <div>
          <label className="label" htmlFor="otp">Authenticator code</label>
          <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
            className="input text-center font-mono text-2xl tracking-[0.5em]" placeholder="000000" />
          <p className="mt-2 text-xs text-muted">Open your authenticator app and enter the 6-digit code for UNIZIK CPGS Records.</p>
        </div>
      )}
      {state.message && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <SubmitButton className="btn-primary w-full" pendingText="Signing in…">{otpStep ? 'Verify and sign in' : 'Sign in'}</SubmitButton>
      <p className="text-center text-xs text-muted">Forgotten password? Contact the CPGS ICT unit to reset it.</p>
    </form>
  );
}
