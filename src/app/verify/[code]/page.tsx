import Link from 'next/link';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { lookupCode } from '@/lib/lookup';
import { fmtDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Verification result' };

export default function VerifyCodePage({ params }: PageProps<'/verify/[code]'>) {
  return (
    <Suspense fallback={<div className="card h-80 animate-pulse" />}>
      <Result params={params} />
    </Suspense>
  );
}

const BANNER = {
  VALID: { cls: 'bg-accent text-white', title: 'Valid document', text: 'This document was issued by the College of Postgraduate Studies, Nnamdi Azikiwe University, and is currently valid.' },
  REVOKED: { cls: 'bg-red-700 text-white', title: 'Revoked', text: 'This document has been revoked by the Records Unit and must not be relied on.' },
  SUPERSEDED: { cls: 'bg-red-700 text-white', title: 'Superseded', text: 'The underlying record was amended after this document was issued. Request a new document.' },
  EXPIRED: { cls: 'bg-amber-500 text-navy', title: 'Expired', text: 'This document was genuine but its validity period has ended. Request a new one from the graduand.' },
} as const;

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await connection();
  const r = await lookupCode(decodeURIComponent(code));

  if (!('name' in r)) {
    const msg = {
      RATE_LIMITED: 'Too many checks from your network. Please wait a minute and try again.',
      INVALID_CODE: 'That is not a valid code. Codes have 8 characters, for example ABCD-2345.',
      NOT_FOUND: 'No document with this code was issued by the College of Postgraduate Studies. Check the code carefully; if it is correct, the document may not be genuine.',
    }[r.status];
    return (
      <div className="card overflow-hidden">
        <div className="bg-navy px-6 py-5 text-white"><div className="text-xl font-semibold">Not verified</div></div>
        <div className="p-6">
          <p className="text-sm">{msg}</p>
          <Link href="/verify" className="btn-primary mt-6">Try another code</Link>
        </div>
      </div>
    );
  }

  const b = BANNER[r.status];
  return (
    <div className="card overflow-hidden">
      <div className={`flex items-center gap-4 px-6 py-5 ${b.cls}`}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl" aria-hidden="true">{r.status === 'VALID' ? '✓' : '!'}</span>
        <div>
          <div className="text-xl font-semibold">{b.title}</div>
          <div className="text-sm opacity-90">{b.text}</div>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
        {[
          ['Graduand', r.name],
          ['Degree', r.degree],
          ['Class of degree', r.classOfDegree],
          ['Session', r.session],
          ['Senate approval', fmtDate(r.senateApprovalDate)],
          ['Document', r.kind],
          ['Issued', fmtDate(r.issuedAt)],
          [r.status === 'REVOKED' ? 'Revoked' : 'Valid until', fmtDate(r.status === 'REVOKED' ? r.revokedAt : r.expiresAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">{k}</dt>
            <dd className="mt-1 font-medium text-navy">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-line bg-slate-50 px-6 py-4 text-xs text-muted">
        Code <span className="font-mono font-semibold text-navy">{r.code}</span>. Compare these details with the document in hand.
        Enquiries: Records Unit, College of Postgraduate Studies, Nnamdi Azikiwe University, Awka.
      </div>
    </div>
  );
}
