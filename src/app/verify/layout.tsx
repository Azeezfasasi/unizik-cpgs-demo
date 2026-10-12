import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { PublicFooter } from '@/components/PublicFooter';

export default function VerifyLayout({ children }: LayoutProps<'/verify'>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/"><Logo light /></Link>
          <span className="text-xs text-slate-300">Result verification</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>
      <PublicFooter />
    </div>
  );
}
