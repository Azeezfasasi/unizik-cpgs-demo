import { Suspense } from 'react';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { AcademicSession, Department, Programme } from '@/models';
import { Alert, Card, PageHeader, PageSkeleton } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/forms';
import { createOnlineSheet } from '../../sheets/actions';

export const metadata: Metadata = { title: 'New submission' };

export default function NewSubmissionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSubmissionPageContent />
    </Suspense>
  );
}

async function NewSubmissionPageContent() {
  const user = await requirePage('submission:create');
  // Only a department PG coordinator can prepare a submission for their own department.
  if (!can(user.role, 'submission:create')) redirect('/submissions');
  await db();
  const [dept, programmes, sessions] = await Promise.all([
    Department.findById(user.department).lean(),
    Programme.find({ department: user.department }).sort({ name: 1 }).lean(),
    AcademicSession.find().sort({ startYear: -1 }).lean(),
  ]);

  return (
    <>
      <PageHeader title="New result submission" description={dept?.name} back={{ href: '/submissions', label: 'Submissions' }} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="1. Choose programme and session">
          {!programmes.length ? (
            <Alert tone="warning">No programmes are registered for your department. Ask the system administrator to add them.</Alert>
          ) : (
            <ActionForm action={createOnlineSheet} className="space-y-4">
              <div>
                <label className="label" htmlFor="programme">Programme</label>
                <select id="programme" name="programme" required className="input">
                  {programmes.map((p) => <option key={p._id.toString()} value={p._id.toString()}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="session">Session</label>
                <select id="session" name="session" required className="input max-w-xs">
                  {sessions.map((s) => <option key={s._id.toString()} value={s._id.toString()}>{s.label}</option>)}
                </select>
              </div>
              <SubmitButton>Create draft and continue</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="What happens next">
          <ol className="space-y-3 text-sm text-muted">
            <li><b className="text-navy">2.</b> Download the CRR template and fill it.</li>
            <li><b className="text-navy">3.</b> Upload it. Every cell is validated before saving.</li>
            <li><b className="text-navy">4.</b> Attach the signed, stamped result sheet (PDF).</li>
            <li><b className="text-navy">5.</b> Submit. It goes to your HOD, then Faculty PG Sub-Dean, Records, the Provost and finally Senate.</li>
            <li>A returned sheet comes back to you with the reason and keeps its reference and history.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
