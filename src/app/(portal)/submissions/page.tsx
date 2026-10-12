import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage, scopeFilter } from '@/lib/auth';
import { listSheets } from '@/lib/queries';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { SheetTable } from '@/components/SheetTable';

export const metadata: Metadata = { title: 'Submissions' };

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubmissionsPageContent />
    </Suspense>
  );
}

async function SubmissionsPageContent() {
  const user = await requirePage('submission:create');
  await db();
  const scope = await scopeFilter(user);
  const rows = await listSheets({ ...scope, origin: 'ONLINE' });
  const groups = [
    { title: 'Needs your action', rows: rows.filter((r) => r.status === 'DRAFT' || r.status === 'RETURNED') },
    { title: 'In approval', rows: rows.filter((r) => !['DRAFT', 'RETURNED', 'SENATE_APPROVED'].includes(r.status)) },
    { title: 'Senate approved and archived', rows: rows.filter((r) => r.status === 'SENATE_APPROVED') },
  ];

  return (
    <>
      <PageHeader
        title="Result submissions"
        description="Final results for your department are submitted here only. Paper submissions are no longer accepted."
        actions={<Link href="/submissions/new" className="btn-primary">New submission</Link>}
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.title} title={`${g.title} (${g.rows.length})`} bodyClass="p-0">
            <SheetTable rows={g.rows} empty="Nothing here" showDept={false} />
          </Card>
        ))}
      </div>
    </>
  );
}
