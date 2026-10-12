'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from './Logo';

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };
export type NavGroup = { title: string; items: NavItem[] };

const ICONS = {
  dashboard: 'M3 3h6v8H3V3Zm8 0h6v5h-6V3ZM3 13h6v4H3v-4Zm8-3h6v7h-6v-7Z',
  search: 'M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.06 1.06-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  box: 'M10 2 17 5.5v9L10 18l-7-3.5v-9L10 2Zm0 1.7L5 6.2l5 2.5 5-2.5-5-2.5ZM4.5 7.4v6.2l4.75 2.4V9.8L4.5 7.4Zm11 0-4.75 2.4V16l4.75-2.4V7.4Z',
  check: 'M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm3.3 5.3-4.3 4.3-2.3-2.3-1.06 1.06L9 13.73l5.36-5.37-1.06-1.06Z',
  upload: 'M10 2l4.5 4.5-1.06 1.06-2.69-2.69V13h-1.5V4.87L6.56 7.56 5.5 6.5 10 2ZM3 14h1.5v2.5h11V14H17v4H3v-4Z',
  inbox: 'M3 4h14v12H3V4Zm1.5 1.5v6h3.25a2.25 2.25 0 0 0 4.5 0h3.25v-6h-11Z',
  edit: 'M13.6 2.6a2 2 0 0 1 2.8 2.8L7 14.8 3 16l1.2-4 9.4-9.4ZM3 17.5h14V19H3v-1.5Z',
  doc: 'M5 2h7l4 4v12H5V2Zm6.5 1.5V7H15l-3.5-3.5ZM7 10v1.5h7V10H7Zm0 3v1.5h7V13H7Z',
  users: 'M7 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm7 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM1.5 16c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5V17h-11v-1Zm12.4-3.9c2.6.2 4.6 1.6 4.6 3.9v1H14v-1c0-1.5-.4-2.8-1.1-3.8l1-.1Z',
  building: 'M3 17V5l7-3 7 3v12h1.5v1.5h-17V17H3Zm2-11v11h3v-4h4v4h3V6l-5-2.2L5 6Zm2 1h2v2H7V7Zm4 0h2v2h-2V7Z',
  shield: 'M10 2 17 5v5c0 4.2-3 7.4-7 8.5C6 17.4 3 14.2 3 10V5l7-3Zm0 1.6L4.5 6v4c0 3.4 2.3 6 5.5 7 3.2-1 5.5-3.6 5.5-7V6L10 3.6Z',
  user: 'M10 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM3.5 17c0-3 2.9-5 6.5-5s6.5 2 6.5 5v1h-13v-1Z',
} as const;

export function Sidebar({ groups, user }: { groups: NavGroup[]; user: { name: string; roleLabel: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + '/');
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      active ? 'bg-brand text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true"><path d={ICONS[it.icon]} /></svg>
                    <span className="flex-1">{it.label}</span>
                    {!!it.count && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? 'bg-white text-brand' : 'bg-accent text-white'}`}>{it.count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-4">
      <div className="truncate text-sm font-medium text-white">{user.name}</div>
      <div className="truncate text-xs text-slate-400">{user.roleLabel}</div>
      <div className="mt-3 flex items-center gap-2">
        <Link href="/account" className="text-xs text-slate-300 hover:text-white">Account</Link>
        <span className="text-slate-600">·</span>
        <form action="/logout" method="post">
          <button className="text-xs text-slate-300 hover:text-white">Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(!open)} className="rounded-md p-2 text-white hover:bg-white/10" aria-label="Toggle menu" aria-expanded={open}>
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><path d="M3 5h14v1.5H3V5Zm0 4.25h14v1.5H3v-1.5ZM3 13.5h14V15H3v-1.5Z" /></svg>
        </button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-white/10 px-5 py-4"><Logo light /></div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
