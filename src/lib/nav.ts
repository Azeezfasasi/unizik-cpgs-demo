import 'server-only';
import type { NavGroup } from '@/components/Sidebar';
import { can, canSee } from './rbac';
import { scopeFilter, type CurrentUser } from './auth';
import { stagesFor } from './workflow';
import { Amendment, DigitizationBatch, ResultSheet } from '@/models';

/** Work waiting for this user, used for sidebar badges and dashboard cards. */
export async function inboxCounts(user: CurrentUser) {
  const scope = await scopeFilter(user);
  const stages = stagesFor(user.role);
  const [approvals, qa, amendments, returned, toLock] = await Promise.all([
    stages.length ? ResultSheet.countDocuments({ ...scope, origin: 'ONLINE', status: { $in: stages } }) : 0,
    can(user.role, 'legacy:qa') ? qaQueueCount(user) : 0,
    can(user.role, 'amendment:approve') ? Amendment.countDocuments({ status: 'PENDING' }) : 0,
    user.role === 'DEPT_OFFICER' ? ResultSheet.countDocuments({ ...scope, origin: 'ONLINE', status: 'RETURNED' }) : 0,
    can(user.role, 'record:lock') ? ResultSheet.countDocuments({ origin: 'LEGACY', status: 'QA_PASSED' }) : 0,
  ]);
  return { approvals, qa, amendments, returned, toLock };
}

async function qaQueueCount(user: CurrentUser) {
  const q: Record<string, unknown> = { origin: 'LEGACY', status: 'INDEXED', createdBy: { $ne: user.id } };
  if (user.role === 'QA_REVIEWER') {
    const batches = await DigitizationBatch.find({ reviewer: user.id }).select('_id').lean();
    q.batch = { $in: batches.map((b) => b._id) };
  }
  return ResultSheet.countDocuments(q);
}

export async function buildNav(user: CurrentUser): Promise<NavGroup[]> {
  const c = await inboxCounts(user);
  const r = user.role;
  const groups: NavGroup[] = [
    {
      title: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        ...(canSee(r, 'record:read') ? [{ href: '/records', label: 'Search records', icon: 'search' as const }] : []),
      ],
    },
  ];

  const work: NavGroup['items'] = [];
  if (canSee(r, 'digitization:view')) work.push({ href: '/digitization', label: 'Digitization', icon: 'box', count: c.toLock || undefined });
  if (canSee(r, 'legacy:qa')) work.push({ href: '/digitization/qa', label: 'QA review', icon: 'check', count: c.qa });
  if (canSee(r, 'submission:create')) work.push({ href: '/submissions', label: 'Submissions', icon: 'upload', count: c.returned });
  if (canSee(r, 'submission:approve')) work.push({ href: '/approvals', label: 'Approvals', icon: 'inbox', count: c.approvals });
  if (canSee(r, 'amendment:request') || canSee(r, 'amendment:approve')) work.push({ href: '/amendments', label: 'Amendments', icon: 'edit', count: c.amendments });
  if (canSee(r, 'transcript:issue')) work.push({ href: '/transcripts', label: 'Issued documents', icon: 'doc' });
  if (work.length) groups.push({ title: 'Work', items: work });

  const admin: NavGroup['items'] = [];
  if (canSee(r, 'user:manage')) admin.push({ href: '/admin/users', label: 'Users', icon: 'users' });
  if (canSee(r, 'structure:manage')) admin.push({ href: '/admin/structure', label: 'Academic structure', icon: 'building' });
  if (canSee(r, 'files:read')) admin.push({ href: '/admin/files', label: 'File storage', icon: 'doc' });
  if (canSee(r, 'apikeys:manage')) admin.push({ href: '/admin/api-keys', label: 'API & integrations', icon: 'building' });
  if (canSee(r, 'audit:read')) admin.push({ href: '/audit', label: 'Audit log', icon: 'shield' });
  if (admin.length) groups.push({ title: 'Administration', items: admin });

  groups.push({ title: 'You', items: [{ href: '/account', label: 'My account', icon: 'user' }] });
  return groups;
}
