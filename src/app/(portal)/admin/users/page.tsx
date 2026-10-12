import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/rbac';
import { fmtDateTime } from '@/lib/format';
import { Department, Faculty, User } from '@/models';
import { Badge, Card, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createUser, resetCredentials, setUserActive, updateUser } from '../actions';

export const metadata: Metadata = { title: 'Users' };

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
  const { role: roleFilter } = await searchParams;
  await db();
  const [users, faculties, departments] = await Promise.all([
    User.find(typeof roleFilter === 'string' && (ROLES as readonly string[]).includes(roleFilter) ? { role: roleFilter as Role } : {}).sort({ isActive: -1, role: 1, name: 1 })
      .populate('department', 'name').populate('faculty', 'name').lean<Row[]>(),
    Faculty.find().sort({ name: 1 }).lean(),
    Department.find().sort({ name: 1 }).lean(),
  ]);

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
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={`${users.length} accounts`} actions={
          <form className="flex gap-2">
            <select name="role" defaultValue={typeof roleFilter === 'string' ? roleFilter : ''} className="input py-1 text-xs">
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button className="btn-outline py-1 text-xs">Filter</button>
          </form>
        } bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Role and unit</th><th>Security</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {users.map((u) => {
                  const id = u._id.toString();
                  const locked = u.lockedUntil && u.lockedUntil > new Date();
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
