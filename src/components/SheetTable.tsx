import Link from 'next/link';
import { daysSince, fmtDate } from '@/lib/format';
import { Badge, EmptyState, StatusBadge } from './ui';

export type SheetRow = {
  id: string; reference: string; origin: string; status: string; programme?: string; department?: string;
  session?: string; recordCount: number; statusSince?: Date | null; boxCode?: string;
};

export function SheetTable({ rows, empty, showDept = true, selectName, selected, onSelect }: {
  rows: SheetRow[]; empty: string; showDept?: boolean;
  /** Adds a checkbox per row (value = sheet id) for bulk actions in an enclosing form. */
  selectName?: string;
  /** Controlled selection, used with selectName from a client component. */
  selected?: Set<string>; onSelect?: (id: string, checked: boolean) => void;
}) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {selectName && <th className="w-8"><span className="sr-only">Select</span></th>}
            <th>Reference</th><th>Programme</th>{showDept && <th>Department</th>}<th>Session</th>
            <th className="text-right">Graduands</th><th>Status</th><th>Since</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const days = daysSince(r.statusSince);
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                {selectName && (
                  <td>
                    <input type="checkbox" name={selectName} value={r.id} aria-label={`Select ${r.reference}`} className="h-4 w-4 accent-brand"
                      checked={selected ? selected.has(r.id) : undefined} onChange={onSelect ? (e) => onSelect(r.id, e.target.checked) : undefined} />
                  </td>
                )}
                <td>
                  <Link href={`/sheets/${r.id}`} className="link font-mono text-xs">{r.reference}</Link>
                  <div className="mt-1 flex gap-1">
                    <Badge tone={r.origin === 'ONLINE' ? 'brand' : 'dark'}>{r.origin === 'ONLINE' ? 'Online' : 'Legacy'}</Badge>
                    {r.boxCode && <Badge>{r.boxCode}</Badge>}
                  </div>
                </td>
                <td>{r.programme ?? '—'}</td>
                {showDept && <td className="text-muted">{r.department ?? '—'}</td>}
                <td>{r.session ?? '—'}</td>
                <td className="text-right tabular-nums">{r.recordCount}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className={`text-xs whitespace-nowrap ${days > 7 && !['SENATE_APPROVED', 'LOCKED'].includes(r.status) ? 'font-semibold text-red-700' : 'text-muted'}`}>
                  {fmtDate(r.statusSince)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
