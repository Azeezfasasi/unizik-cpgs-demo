import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage, scopeFilter } from '@/lib/auth';
import { listSheets } from '@/lib/queries';
import { FLOW, stagesFor, type FlowStage } from '@/lib/workflow';
import { can, ROLE_LABELS } from '@/lib/rbac';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { SheetTable } from '@/components/SheetTable';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApprovalsPageContent />
    </Suspense>
  );
}

async function ApprovalsPageContent() {
  const user = await requirePage('submission:approve');
  await db();
  const scope = await scopeFilter(user);
  // The administrator oversees every stage but does not act on any of them.
  const oversight = !can(user.role, 'submission:approve');
  const stages = oversight ? (Object.keys(FLOW) as FlowStage[]) : stagesFor(user.role);
  const [inbox, recent] = await Promise.all([
    listSheets({ ...scope, origin: 'ONLINE', status: { $in: stages } }),
    listSheets({ ...scope, origin: 'ONLINE', 'approvals.by': user.id }, 25),
  ]);

  return (
    <>
      <PageHeader
        title={oversight ? 'Approvals overview' : 'Approvals inbox'}
        description={oversight
          ? 'Every online submission currently in the approval chain, across all departments (view only). Decisions are made by the HOD, Faculty PG Sub-Dean, Head of Records and Provost. Sheets held more than 7 days are highlighted.'
          : `Sheets waiting at your stage as ${ROLE_LABELS[user.role]}: ${stages.map((s) => FLOW[s].label).join(' and ')}. Sheets held more than 7 days are highlighted.`}
      />
      <div className="space-y-6">
        <Card title={`${oversight ? 'In approval' : 'Waiting for you'} (${inbox.length})`} bodyClass="p-0">
          <SheetTable rows={inbox} empty={oversight ? 'No sheets are in approval' : 'Your inbox is clear'} />
        </Card>
        {!oversight && (
          <Card title="Recently acted on by you" bodyClass="p-0">
            <SheetTable rows={recent} empty="No decisions yet" />
          </Card>
        )}
      </div>
    </>
  );
}
