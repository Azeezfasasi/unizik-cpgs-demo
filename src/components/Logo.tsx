export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path d="M20 2 36 8v11c0 9.5-6.6 16.6-16 19C10.6 35.6 4 28.5 4 19V8l16-6Z" fill="#009689" />
      <path d="M20 6.2 32 10.7V19c0 7.4-5 13-12 15-7-2-12-7.6-12-15v-8.3l12-4.5Z" fill="#0f172a" />
      <path d="M12 14h16v2.2H12zM12 18.4h16v2.2H12zM12 22.8h10v2.2H12z" fill="#fff" />
      <circle cx="26.5" cy="25.5" r="3.6" fill="#007a55" stroke="#fff" strokeWidth="1.2" />
      <path d="m24.9 25.5 1.1 1.1 2-2.1" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className={`text-sm font-bold tracking-wide ${light ? 'text-white' : 'text-navy'}`}>UNIZIK CPGS</div>
        <div className={`text-xs ${light ? 'text-slate-300' : 'text-muted'}`}>Results Repository</div>
      </div>
    </div>
  );
}
