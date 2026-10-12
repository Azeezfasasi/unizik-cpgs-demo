'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail } from '@/lib/errors';
import { BatchSchema, objectId } from '@/lib/validators';
import type { ActionState } from '@/lib/action-state';
import { DigitizationBatch, ResultSheet, User } from '@/models';
import { BATCH_STATUS } from '@/models/DigitizationBatch';

export async function createBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await requirePermission('batch:assign');
    await db();
    const data = BatchSchema.parse({ ...Object.fromEntries(fd), sessions: fd.getAll('sessions') });
    const b = await DigitizationBatch.create({ ...data, createdBy: user.id });
    await audit(user, 'batch.create', 'DigitizationBatch', b.id, undefined, { boxCode: b.boxCode, condition: b.condition });
    id = b.id;
  });
  if (id) redirect(`/digitization/batches/${id}`);
  return res;
}

export async function assignBatch(batchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('batch:assign');
    await db();
    const indexer = objectId.optional().parse(fd.get('indexer') || undefined);
    const reviewer = objectId.optional().parse(fd.get('reviewer') || undefined);
    if (indexer && reviewer && indexer === reviewer) fail('Indexer and QA reviewer must be different people');
    const [iu, ru] = await Promise.all([
      indexer ? User.findOne({ _id: indexer, isActive: true, role: { $in: ['INDEXER', 'TASKFORCE_LEAD'] } }).lean() : null,
      reviewer ? User.findOne({ _id: reviewer, isActive: true, role: { $in: ['QA_REVIEWER', 'HEAD_RECORDS'] } }).lean() : null,
    ]);
    if (indexer && !iu) fail('Pick an active indexer');
    if (reviewer && !ru) fail('Pick an active QA reviewer');
    const b = await DigitizationBatch.findById(batchId);
    if (!b) fail('Box not found');
    const before = { indexer: b!.indexer?.toString(), reviewer: b!.reviewer?.toString() };
    b!.set({ indexer: indexer ?? undefined, reviewer: reviewer ?? undefined });
    await b!.save();
    await audit(user, 'batch.assign', 'DigitizationBatch', batchId, before, { indexer, reviewer });
    return { ok: true, message: 'Assignments saved.' };
  });
}

export async function setBatchStatus(batchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('batch:assign');
    await db();
    const status = String(fd.get('status'));
    if (!(BATCH_STATUS as readonly string[]).includes(status)) fail('Unknown status');
    if (status === 'COMPLETED') {
      const open = await ResultSheet.countDocuments({ batch: batchId, status: { $ne: 'LOCKED' } });
      if (open) fail(`${open} sheet(s) in this box are not locked yet`);
    }
    const b = await DigitizationBatch.findById(batchId);
    if (!b) fail('Box not found');
    const before = b!.status;
    b!.status = status as (typeof BATCH_STATUS)[number];
    await b!.save();
    await audit(user, 'batch.status', 'DigitizationBatch', batchId, { status: before }, { status });
  });
}
