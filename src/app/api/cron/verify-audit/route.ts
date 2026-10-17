import { cronAuthorized } from '@/lib/cron';
import { verifyAuditChain, audit, describeChainBreak } from '@/lib/audit';
import { sendMail } from '@/lib/mail';
import { User } from '@/models';

export const maxDuration = 300;

/** Nightly: recomputes the audit hash chain and alerts SUPER_ADMIN and AUDITOR if any link breaks. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  const r = await verifyAuditChain();
  if (!r.ok) {
    const to = await User.find({ role: { $in: ['SUPER_ADMIN', 'AUDITOR'] }, isActive: true }).select('name email').lean();
    await sendMail({
      to: to.map((u) => ({ email: u.email, name: u.name })),
      subject: 'URGENT: CPGS audit log integrity check failed',
      html: `<p>The nightly check of the audit hash chain failed. ${describeChainBreak(r)}</p><p>This indicates audit entries were altered or removed. Preserve the database state and begin the breach procedure.</p>`,
    });
  }
  await audit(null, 'cron.verify_audit', 'AuditLog', undefined, undefined, r);
  return Response.json(r);
}
