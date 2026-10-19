import Image from 'next/image';

/** The UNIZIK crest on a white disc, so it shows on the navy headers as well as on light backgrounds. */
export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 ${className}`}>
      <Image src="/uniziktransparent.png" alt="" width={448} height={557} priority className="h-[78%] w-auto" />
    </span>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight whitespace-nowrap">
        <div className={`text-sm font-bold tracking-wide ${light ? 'text-white' : 'text-navy'}`}>UNIZIK CPGS</div>
        <div className={`text-xs ${light ? 'text-slate-300' : 'text-muted'}`}>Results Repository</div>
      </div>
    </div>
  );
}
