'use client';

import { useState, useTransition } from 'react';
import { ActionForm, SubmitButton } from '@/components/forms';
import { confirmMfa, startMfaEnrolment } from '../actions';

export function MfaEnrol() {
  const [data, setData] = useState<{ qr: string; secret: string } | null>(null);
  const [pending, start] = useTransition();

  if (!data) {
    return (
      <ol className="space-y-4 text-sm">
        <li className="flex gap-3"><Num n={1} />Install an authenticator app on your phone.</li>
        <li className="flex gap-3"><Num n={2} />Generate your personal QR code and scan it with the app.</li>
        <li className="flex gap-3"><Num n={3} />Enter the 6-digit code the app shows to finish.</li>
        <li>
          <button className="btn-primary mt-2 w-full" disabled={pending}
            onClick={() => start(async () => {
              const r = await startMfaEnrolment();
              if (r.data) setData({ qr: r.data.qr, secret: r.data.secret });
            })}>
            {pending ? 'Generating…' : 'Generate QR code'}
          </button>
        </li>
      </ol>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-slate-50 p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded bg-white p-2" />
        <div className="text-center text-xs text-muted">
          Can&apos;t scan? Enter this key manually:
          <div className="mt-1 font-mono text-sm font-semibold tracking-wider text-navy select-all">{data.secret}</div>
        </div>
      </div>
      <ActionForm action={confirmMfa} className="space-y-3">
        <label className="label" htmlFor="otp">Code from your app</label>
        <input id="otp" name="otp" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus autoComplete="one-time-code"
          className="input text-center font-mono text-2xl tracking-[0.5em]" placeholder="000000" />
        <SubmitButton className="btn-accent w-full">Verify and finish</SubmitButton>
      </ActionForm>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>;
}
