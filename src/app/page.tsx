import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { PublicFooter } from '@/components/PublicFooter';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo light />
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/verify" className="rounded-md px-3 py-2 text-slate-200 hover:text-white">Verify a result</Link>
            <Link href="/login" className="btn-primary">Staff sign in</Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #009689 0, transparent 45%), radial-gradient(circle at 10% 90%, #007a55 0, transparent 40%)' }} />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-teal-200">
              College of Postgraduate Studies · Nnamdi Azikiwe University, Awka
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">CPGS Results Repository</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">
              Every postgraduate final result, past and present, kept as one authoritative, searchable and
              tamper-evident digital record.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary px-5 py-2.5">Staff sign in</Link>
              <Link href="/verify" className="btn border border-white/30 px-5 py-2.5 text-white hover:bg-white/10">Verify a document</Link>
            </div>
          </div>
          <div className="card border-white/10 bg-white/5 p-6 text-sm text-slate-200 backdrop-blur">
            <h2 className="mb-4 text-base font-semibold text-white">Verifying a UNIZIK postgraduate result?</h2>
            <p>Employers and institutions can confirm a statement of result or transcript without contacting the Records Unit.</p>
            <ol className="mt-4 space-y-2">
              <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold">1</span>Find the 8-character code printed beside the QR code on the document.</li>
              <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold">2</span>Scan the QR code, or enter the code on the verification page.</li>
              <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold">3</span>Compare the name, degree and class shown with the document in hand.</li>
            </ol>
            <Link href="/verify" className="btn-accent mt-6 w-full">Go to verification</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-3">
        {[
          { t: 'Legacy digitization', d: 'Paper result sheets are scanned to archival standard, indexed, checked by a second officer and locked.', c: 'bg-brand' },
          { t: 'Online submission', d: 'Departments submit final results online. Each sheet moves through HOD, Faculty, Records, Provost and Senate approval.', c: 'bg-accent' },
          { t: 'Verification', d: 'Every issued statement and transcript carries a QR code and verification code that can be checked here at any time.', c: 'bg-navy' },
        ].map((f) => (
          <div key={f.t} className="card p-6">
            <span className={`mb-4 block h-1 w-10 rounded ${f.c}`} />
            <h3 className="font-semibold text-navy">{f.t}</h3>
            <p className="mt-2 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </section>

      <PublicFooter />
    </div>
  );
}
