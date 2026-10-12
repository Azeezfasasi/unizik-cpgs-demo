import Link from 'next/link';
import { daysSince, fmtDate } from '@/lib/format';
import { Badge, EmptyState, StatusBadge } from './ui';

export type SheetRow = {
  id: string; reference: string; origin: string; status: string; programme?: string; department?: string;
  session?: string; recordCount: number; statusSince?: Date | null; boxCode?: string;
};

export function SheetTable({ rows, empty, showDept = true }: { rows: SheetRow[]; empty: string; showDept?: boolean }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Reference</th><th>Programme</th>{showDept && <th>Department</th>}<th>Session</th>
            <th className="text-right">Graduands</th><th>Status</th><th>Since</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const days = daysSince(r.statusSince);
            return (
              <tr key={r.id} className="hover:bg-slate-50">
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
