'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { BatchSchema, objectId } from '@/lib/validators';
import type { ActionState } from '@/lib/action-state';
import { Department, DigitizationBatch, ResultSheet, User } from '@/models';
import { BATCH_STATUS } from '@/models/DigitizationBatch';

export async function createBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await requirePermission('batch:assign');
    await db();
    const data = BatchSchema.parse({
      ...Object.fromEntries(fd), sessions: fd.getAll('sessions'),
      departments: fd.getAll('departments').map(String).filter(Boolean), allDepartments: fd.get('allDepartments') === 'on',
    });
    const departments = data.allDepartments ? [] : [...new Set(data.departments)];
    if (departments.length && (await Department.countDocuments({ _id: { $in: departments } })) !== departments.length) {
      fail('One of the chosen departments no longer exists');
    }
    const b = await DigitizationBatch.create({ ...data, departments, allDepartments: data.allDepartments, createdBy: user.id });
    await audit(user, 'batch.create', 'DigitizationBatch', b.id, undefined, {
      boxCode: b.boxCode, condition: b.condition, departments: departments.length, allDepartments: data.allDepartments,
    });
    id = b.id;
  });
  // Portal forms go to the new item; REST API calls (fd __api=1) get its id instead.
  if (id && fd.get('__api') !== '1') redirect(`/digitization/batches/${id}`);
  return id ? { ...res, data: { id } } : res;
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
    if (!b) missing('Box not found');
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
    if (!b) missing('Box not found');
    const before = b!.status;
    b!.status = status as (typeof BATCH_STATUS)[number];
    await b!.save();
    await audit(user, 'batch.status', 'DigitizationBatch', batchId, { status: before }, { status });
  });
}
