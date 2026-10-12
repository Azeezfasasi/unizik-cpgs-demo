import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Verify a result' };

async function go(fd: FormData) {
  'use server';
  const code = String(fd.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  redirect(`/verify/${code.slice(0, 4)}-${code.slice(4, 8)}`);
}

export default function VerifyPage() {
  return (
    <div className="card p-8">
      <h1 className="text-2xl font-semibold text-navy">Verify a UNIZIK postgraduate result</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the 8-character verification code printed beside the QR code on the statement of result or transcript.
        Scanning the QR code opens this check directly.
      </p>
      <form action={go} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input name="code" required placeholder="ABCD-2345" maxLength={9} autoComplete="off" aria-label="Verification code"
          className="input flex-1 text-center font-mono text-2xl tracking-widest uppercase" />
        <button className="btn-primary px-8">Verify</button>
      </form>
      <p className="mt-6 text-xs text-muted">
        This service confirms that a document was issued by the College of Postgraduate Studies and shows its key details.
        It does not show scores or personal contact details. Each check is logged.
      </p>
    </div>
  );
}
