import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { listSheets } from '@/lib/queries';
import { DigitizationBatch } from '@/models';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { SheetTable } from '@/components/SheetTable';
import { BulkSheetForm } from '@/components/BulkSheetForm';
import { can } from '@/lib/rbac';
import { bulkLockSheets, bulkQaPass } from '../../sheets/actions';

export const metadata: Metadata = { title: 'QA review' };

export default function QaQueuePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QaQueuePageContent />
    </Suspense>
  );
}

async function QaQueuePageContent() {
  const user = await requirePage('legacy:qa');
  await db();
  const filter: Record<string, unknown> = { origin: 'LEGACY', status: 'INDEXED', createdBy: { $ne: user.id } };
  if (user.role === 'QA_REVIEWER') {
    const batches = await DigitizationBatch.find({ reviewer: user.id }).select('_id').lean();
    filter.batch = { $in: batches.map((b) => b._id) };
  }
  const canLock = can(user.role, 'record:lock');
  const [queue, done, toLock] = await Promise.all([
    listSheets(filter),
    listSheets({ origin: 'LEGACY', approvals: { $elemMatch: { stage: 'QA', by: user.id } } }, 25),
    canLock ? listSheets({ origin: 'LEGACY', status: 'QA_PASSED' }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="QA review queue"
        description="Compare every indexed row against its scan, then pass or return the sheet. You never see sheets you indexed yourself."
      />
      <div className="space-y-6">
        <Card title={`Awaiting QA (${queue.length})`} bodyClass="p-0">
          <BulkSheetForm rows={queue} empty="Nothing waiting for QA"
            action={bulkQaPass} submitLabel="Pass QA for selected" pendingText="Passing…"
            confirm={{ name: 'attest', label: 'I compared every row of each selected sheet against its scan, and all values match.' }} />
        </Card>
        {canLock && (
          <Card title={`QA passed, ready to lock (${toLock.length})`} bodyClass="p-0">
            <BulkSheetForm rows={toLock} empty="No sheets waiting to be locked"
              action={bulkLockSheets} submitLabel="Lock selected" pendingText="Locking…"
              option={{ name: 'acceptIllegible', label: 'Also lock sheets that have rows flagged illegible (otherwise they are skipped)' }} />
          </Card>
        )}
        <Card title="Recently reviewed by you" bodyClass="p-0">
          <SheetTable rows={done} empty="No reviews yet" />
        </Card>
      </div>
    </>
  );
}
