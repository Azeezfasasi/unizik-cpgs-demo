import Link from 'next/link';
import { StaffLink } from './StaffLink';

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© College of Postgraduate Studies, Nnamdi Azikiwe University, Awka.</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-brand">Privacy notice</Link>
          <Link href="/verify" className="hover:text-brand">Verify a result</Link>
          <StaffLink className="hover:text-brand" />
        </div>
      </div>
    </footer>
  );
}
