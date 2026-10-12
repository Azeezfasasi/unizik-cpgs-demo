import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { buildNav } from '@/lib/nav';
import { ROLE_LABELS } from '@/lib/rbac';
import { Sidebar } from '@/components/Sidebar';
import { Logo } from '@/components/Logo';

// Every portal page depends on the signed-in user, so navigations may block on the server.
export const instant = false;

export default function PortalLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<SidebarSkeleton />}>
        <PortalSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          CPGS Results Repository · College of Postgraduate Studies, Nnamdi Azikiwe University, Awka · All activity is recorded.
        </footer>
      </div>
    </div>
  );
}

async function PortalSidebar() {
  const user = await requireUser();
  const groups = await buildNav(user);
  return <Sidebar groups={groups} user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }} />;
}

function SidebarSkeleton() {
  return (
    <>
      <div className="flex items-center bg-navy px-4 py-3 lg:hidden"><Logo light /></div>
      <aside className="hidden h-screen w-64 shrink-0 flex-col bg-navy lg:flex">
        <div className="border-b border-white/10 px-5 py-4"><Logo light /></div>
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}
        </div>
      </aside>
    </>
  );
}
