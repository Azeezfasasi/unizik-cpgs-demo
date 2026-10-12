'use client';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button onClick={() => window.print()} className="text-xs link print:hidden">{label}</button>;
}
