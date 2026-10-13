import { audit, verifyAuditChain } from '@/lib/audit';
import { json, requireRead, v1 } from '@/lib/v1';

/** Recomputes the audit hash chain. intact=false means an entry was altered or removed. */
export const POST = v1(async () => {
  const user = await requireRead('audit:read');
  const r = await verifyAuditChain();
  await audit(user, 'audit.verify', 'AuditLog', undefined, undefined, { ...r, via: 'api' });
  return json({ data: { intact: r.ok, checked: r.checked, brokenAt: r.brokenAt } }, r.ok ? 200 : 409);
});
