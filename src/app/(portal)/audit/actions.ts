'use server';

import { requirePermission } from '@/lib/auth';
import { audit, describeChainBreak, verifyAuditChain } from '@/lib/audit';
import type { ActionState } from '@/lib/action-state';

export async function checkChain(): Promise<ActionState> {
  const user = await requirePermission('audit:read');
  const r = await verifyAuditChain();
  await audit(user, 'audit.verify', 'AuditLog', undefined, undefined, r);
  return r.ok
    ? { ok: true, message: `Chain intact: all ${r.checked.toLocaleString()} entries verified.` }
    : { ok: false, message: `${describeChainBreak(r)} Report this to Internal Audit immediately.` };
}
