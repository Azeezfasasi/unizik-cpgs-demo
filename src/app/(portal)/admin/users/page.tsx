import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/rbac';
import { fmtDateTime } from '@/lib/format';
import { Department, Faculty, User } from '@/models';
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Pagination } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createUser, resetCredentials, setUserActive, updateUser } from '../actions';

export const metadata: Metadata = { title: 'Users' };

const PAGE = 25;

type Row = {
  _id: Types.ObjectId; name: string; email: string; role: keyof typeof ROLE_LABELS; isActive: boolean; mfaEnabled: boolean;
  mustChangePassword: boolean; lastLoginAt?: Date; lockedUntil?: Date;
  department?: { _id: Types.ObjectId; name: string }; faculty?: { _id: Types.ObjectId; name: string };
};

export default function UsersPage(props: PageProps<'/admin/users'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersPageContent {...props} />
    </Suspense>
  );
}

async function UsersPageContent({ searchParams }: PageProps<'/admin/users'>) {
  const user = await requirePage('user:manage');
  const sp = (await searchParams) as Record<string, string | undefined>;
  await db();
  const now = new Date();

  // ---- filters ----
  const and: Record<string, unknown>[] = [];
  const q = sp.q?.trim().slice(0, 100);
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    and.push({ $or: [{ name: rx }, { email: rx }] });
  }
  if (sp.role && (ROLES as readonly string[]).includes(sp.role)) and.push({ role: sp.role as Role });
  if (sp.department && Types.ObjectId.isValid(sp.department)) and.push({ department: sp.department });
  if (sp.faculty && Types.ObjectId.isValid(sp.faculty)) {
    // Faculty-level staff, plus department staff whose department sits in that faculty.
    const depts = await Department.find({ faculty: sp.faculty }).select('_id').lean();
    and.push({ $or: [{ faculty: sp.faculty }, { department: { $in: depts.map((d) => d._id) } }] });
  }
  if (sp.status === 'active') and.push({ isActive: true });
  if (sp.status === 'inactive') and.push({ isActive: false });
  const SECURITY: Record<string, Record<string, unknown>> = {
    mfa_on: { mfaEnabled: true },
    mfa_off: { mfaEnabled: { $ne: true } },
    temp_password: { mustChangePassword: true },
    locked: { lockedUntil: { $gt: now } },
    never: { lastLoginAt: null },
  };
  if (sp.security && SECURITY[sp.security]) and.push(SECURITY[sp.security]);
  const filter = and.length ? { $and: and } : {};

  const SORTS: Record<string, Record<string, 1 | -1>> = {
    name: { isActive: -1, name: 1 },
    role: { isActive: -1, role: 1, name: 1 },
    recent: { lastLoginAt: -1, name: 1 },
    newest: { createdAt: -1 },
  };
  const sort = SORTS[sp.sort ?? ''] ?? SORTS.role;
  const page = Math.max(1, parseInt(sp.page ?? '1') || 1);

  const [total, users, faculties, departments, counts] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort(sort).skip((page - 1) * PAGE).limit(PAGE)
      .populate('department', 'name').populate('faculty', 'name').lean<Row[]>(),
    Faculty.find().sort({ name: 1 }).lean(),
    Department.find().sort({ name: 1 }).lean(),
    Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ isActive: true, mfaEnabled: { $ne: true } }),
      User.countDocuments({ mustChangePassword: true }),
      User.countDocuments({ lockedUntil: { $gt: now } }),
    ]),
  ]);
  const [allCount, inactiveCount, noMfaCount, tempCount, lockedCount] = counts;
  const filtered = and.length > 0;

  const qs = (extra: Record<string, string | number>) =>
    '?' + new URLSearchParams({
      ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== 'page')) as Record<string, string>,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    }).toString();
  const chip = (label: string, n: number, params: Record<string, string>, tone: string) => (
    <Link href={`/admin/users?${new URLSearchParams(params)}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-brand ${tone}`}>
      {label} <span className="tabular-nums">{n}</span>
    </Link>
  );

  const unitSelects = (d?: string, f?: string) => (
    <>
      <select name="department" defaultValue={d ?? ''} className="input" aria-label="Department">
        <option value="">Department (HOD, PG coordinator)</option>
        {departments.map((x) => <option key={x._id.toString()} value={x._id.toString()}>{x.name}</option>)}
      </select>
      <select name="faculty" defaultValue={f ?? ''} className="input" aria-label="Faculty">
        <option value="">Faculty (Faculty PG Sub-Dean)</option>
        {faculties.map((x) => <option key={x._id.toString()} value={x._id.toString()}>{x.name}</option>)}
      </select>
    </>
  );

  return (
    <>
      <PageHeader title="Staff accounts" description="Department-level roles only ever see their own department or faculty. New accounts must change the temporary password and enrol an authenticator." />

      <div className="mb-4 flex flex-wrap gap-2">
        {chip('All accounts', allCount, {}, 'border-line bg-white text-navy')}
        {chip('Inactive', inactiveCount, { status: 'inactive' }, 'border-line bg-white text-slate-700')}
        {chip('Active without MFA', noMfaCount, { status: 'active', security: 'mfa_off' }, noMfaCount ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-line bg-white text-slate-700')}
        {chip('Temporary password', tempCount, { security: 'temp_password' }, 'border-line bg-white text-slate-700')}
        {chip('Locked out', lockedCount, { security: 'locked' }, lockedCount ? 'border-red-300 bg-red-50 text-red-700' : 'border-line bg-white text-slate-700')}
      </div>

      <form className="card mb-6 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name or email" aria-label="Search name or email" className="input sm:col-span-2" />
        <select name="role" defaultValue={sp.role ?? ''} aria-label="Role" className="input">
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select name="faculty" defaultValue={sp.faculty ?? ''} aria-label="Faculty" className="input">
          <option value="">All faculties</option>
          {faculties.map((x) => <option key={x._id.toString()} value={x._id.toString()}>{x.name}</option>)}
        </select>
        <select name="department" defaultValue={sp.department ?? ''} aria-label="Department" className="input">
          <option value="">All departments</option>
          {departments.map((x) => <option key={x._id.toString()} value={x._id.toString()}>{x.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ''} aria-label="Status" className="input">
          <option value="">Active and inactive</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <select name="security" defaultValue={sp.security ?? ''} aria-label="Security" className="input">
          <option value="">Any security state</option>
          <option value="mfa_on">MFA enabled</option>
          <option value="mfa_off">No MFA</option>
          <option value="temp_password">Temporary password</option>
          <option value="locked">Locked out</option>
          <option value="never">Never signed in</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? 'role'} aria-label="Sort" className="input">
          <option value="role">Sort: role</option>
          <option value="name">Sort: name</option>
          <option value="recent">Sort: last sign-in</option>
          <option value="newest">Sort: newest account</option>
        </select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4 2xl:col-span-8">
          <button className="btn-primary">Search</button>
          {filtered && <Link href="/admin/users" className="btn-outline">Clear</Link>}
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={filtered ? `${total} of ${allCount} accounts match` : `${total} accounts`} bodyClass="p-0">
          {users.length === 0 ? <EmptyState title="No accounts match">Try a shorter search or clear some filters.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Role and unit</th><th>Security</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {users.map((u) => {
                  const id = u._id.toString();
                  const locked = u.lockedUntil && u.lockedUntil > now;
                  return (
                    <tr key={id} className={u.isActive ? '' : 'opacity-60'}>
                      <td><div className="font-medium text-navy">{u.name}</div><div className="text-xs text-muted">{u.email}</div></td>
                      <td>
                        <div>{ROLE_LABELS[u.role]}</div>
                        <div className="text-xs text-muted">{u.department?.name ?? u.faculty?.name ?? 'University-wide'}</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {!u.isActive && <Badge tone="danger">Inactive</Badge>}
                          {locked && <Badge tone="danger">Locked out</Badge>}
                          {u.mfaEnabled ? <Badge tone="success">MFA</Badge> : <Badge tone="warning">No MFA</Badge>}
                          {u.mustChangePassword && <Badge tone="warning">Temp password</Badge>}
                        </div>
                      </td>
                      <td className="text-xs whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</td>
                      <td className="text-right">
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs link">Manage</summary>
                          <div className="mt-2 w-72 space-y-3 rounded-md border border-line bg-white p-3 shadow-sm">
                            <ActionForm action={updateUser.bind(null, id)} className="space-y-2">
                              <select name="role" defaultValue={u.role} className="input">
                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                              </select>
                              {unitSelects(u.department?._id.toString(), u.faculty?._id.toString())}
                              <SubmitButton className="btn-primary w-full py-1.5">Save role</SubmitButton>
                            </ActionForm>
                            <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                              <ActionForm action={resetCredentials.bind(null, id)} confirm="Generate a new temporary password?">
                                <input type="hidden" name="what" value="password" />
                                <SubmitButton className="btn-outline w-full px-2 py-1 text-xs">Reset password</SubmitButton>
                              </ActionForm>
                              <ActionForm action={resetCredentials.bind(null, id)} confirm="Remove this user's authenticator?">
                                <input type="hidden" name="what" value="mfa" />
                                <SubmitButton className="btn-outline w-full px-2 py-1 text-xs">Reset MFA</SubmitButton>
                              </ActionForm>
                            </div>
                            {id !== user.id && (
                              <ActionForm action={setUserActive.bind(null, id)} confirm={u.isActive ? 'Deactivate this account? The user is signed out immediately.' : 'Reactivate this account?'}>
                                <input type="hidden" name="active" value={u.isActive ? 'false' : 'true'} />
                                <SubmitButton className={`${u.isActive ? 'btn-danger' : 'btn-accent'} w-full py-1.5 text-xs`}>{u.isActive ? 'Deactivate' : 'Reactivate'}</SubmitButton>
                              </ActionForm>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          <Pagination page={page} pages={Math.ceil(total / PAGE)} href={(p) => `/admin/users${qs({ page: p })}`} />
        </Card>

        <Card title="Create account">
          <ActionForm action={createUser} className="space-y-3" resetOnSuccess>
            <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required className="input" /></div>
            <div><label className="label" htmlFor="email">Official email</label><input id="email" name="email" type="email" required className="input" /></div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" name="role" required className="input">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            {unitSelects()}
            <SubmitButton className="btn-primary w-full">Create account</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
