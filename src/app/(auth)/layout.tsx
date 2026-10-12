import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, #009689 0, transparent 50%), radial-gradient(circle at 90% 10%, #007a55 0, transparent 40%)' }} />
        <Link href="/" className="relative"><Logo light /></Link>
        <div className="relative mt-auto">
          <h2 className="text-3xl font-semibold tracking-tight">One authoritative record for every postgraduate result.</h2>
          <p className="mt-4 max-w-md text-slate-300">
            Restricted to authorised staff of the College of Postgraduate Studies and academic departments.
            All activity is logged.
          </p>
          <div className="mt-8 flex gap-6 text-sm text-slate-300">
            <div><div className="text-2xl font-semibold text-white">MFA</div>for every staff account</div>
            <div><div className="text-2xl font-semibold text-white">5-stage</div>approval chain</div>
            <div><div className="text-2xl font-semibold text-white">Hash-chained</div>audit trail</div>
          </div>
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-md">{children}</div>
        <p className="mt-10 max-w-md text-center text-xs text-muted">
          Personal data is processed under the Nigeria Data Protection Act 2023. See the <Link className="link" href="/privacy">privacy notice</Link>.
        </p>
      </main>
    </div>
  );
}
