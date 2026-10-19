/**
 * Small dependency-free charts for the dashboard, rendered on the server. Columns are HTML so the
 * labels stay crisp at any width; the donut is SVG. Every mark has a native hover title.
 */

export type Series = { name: string; color: string };

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((v) => v >= n) ?? n;
}

export function Legend({ items }: { items: { name: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" role="list">
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
          {s.name}{s.value != null && <span className="font-medium text-navy tabular-nums">{s.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Stacked columns, one per period. `values` follow the order of `series`. */
export function ColumnChart({ data, series, unit }: { data: { label: string; values: number[] }[]; series: Series[]; unit: string }) {
  const top = niceMax(Math.max(0, ...data.map((d) => d.values.reduce((a, v) => a + v, 0))));
  const ticks = [top, top / 2, 0];
  return (
    <div>
      <div className="mb-4"><Legend items={series} /></div>
      <div className="grid grid-cols-[2.25rem_1fr] gap-2">
        <div className="relative h-48 text-right text-[11px] text-muted tabular-nums">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>{t.toLocaleString()}</span>
          ))}
        </div>
        <div className="relative h-48">
          {ticks.map((t, i) => (
            <div key={t} className={`absolute inset-x-0 border-t ${i === 2 ? 'border-slate-300' : 'border-dashed border-line'}`} style={{ top: `${i * 50}%` }} />
          ))}
          <div className="relative flex h-full items-end gap-1 sm:gap-2">
            {data.map((d) => {
              const total = d.values.reduce((a, v) => a + v, 0);
              return (
                <div key={d.label} className="group flex h-full flex-1 flex-col-reverse"
                  title={`${d.label}: ${total.toLocaleString()} ${unit}${series.length > 1 ? ` (${series.map((s, i) => `${d.values[i]} ${s.name.toLowerCase()}`).join(', ')})` : ''}`}>
                  {d.values.map((v, i) => v > 0 && (
                    <div key={series[i].name} className="mx-auto w-full max-w-9 last:rounded-t group-hover:opacity-85"
                      style={{ height: `${(v / top) * 100}%`, minHeight: 2, background: series[i].color }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div />
        <div className="flex gap-1 sm:gap-2">
          {data.map((d, i) => (
            <span key={d.label} className={`flex-1 text-center text-[11px] text-muted ${i % 2 ? 'max-sm:invisible' : ''}`}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Donut of parts of a whole, with the total in the middle and a legend with counts. */
export function DonutChart({ parts, unit }: { parts: { name: string; value: number; color: string }[]; unit: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  // Each slice starts where the previous ones end (percent of the circle).
  const shown = parts.filter((p) => p.value > 0).map((p, i, all) => ({
    ...p, pct: (p.value / total) * 100, start: all.slice(0, i).reduce((a, q) => a + (q.value / total) * 100, 0),
  }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" role="img" aria-label={`${total} ${unit}`}>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="6" />
          {shown.map((p) => (
            <circle key={p.name} cx="21" cy="21" r="15.915" fill="none" stroke={p.color} strokeWidth="6"
              strokeDasharray={`${p.pct} ${100 - p.pct}`} strokeDashoffset={-p.start}>
              <title>{`${p.name}: ${p.value.toLocaleString()} (${Math.round(p.pct)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-navy tabular-nums">{total.toLocaleString()}</span>
          <span className="text-xs text-muted">{unit}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm" role="list">
        {parts.map((p) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="flex-1 text-muted">{p.name}</span>
            <span className="font-medium text-navy tabular-nums">{p.value.toLocaleString()}</span>
            <span className="w-10 text-right text-xs text-muted tabular-nums">{total ? `${Math.round((p.value / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
