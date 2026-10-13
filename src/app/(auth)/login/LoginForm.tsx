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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className={otpStep ? 'hidden' : ''}>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="input" placeholder="name@unizik.edu.ng" />
      </div>
      <div className={otpStep ? 'hidden' : ''}>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="input pr-11" />
          <button type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="password"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" />
              <circle cx="10" cy="10" r="2.5" />
              {showPassword && <path d="M3 17 17 3" />}
            </svg>
          </button>
        </div>
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
