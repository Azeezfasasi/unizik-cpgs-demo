/** Single-series horizontal bars: brand teal marks, values in text ink, native hover title per row. */
export function BarList({ rows, unit, max }: { rows: { label: string; value: number }[]; unit: string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((r) => {
        const pct = Math.min(100, (r.value / top) * 100);
        return (
          <li key={r.label} className="group grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm" title={`${r.label}: ${r.value.toLocaleString()} ${unit}`}>
            <span className="truncate text-muted">{r.label}</span>
            <span className="h-3 rounded-r bg-slate-100">
              <span className="block h-3 rounded-r bg-brand transition-colors group-hover:bg-brand-hover" style={{ width: `${pct}%`, minWidth: r.value ? 4 : 0 }} />
            </span>
            <span className="text-right font-medium text-navy tabular-nums">{r.value.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
