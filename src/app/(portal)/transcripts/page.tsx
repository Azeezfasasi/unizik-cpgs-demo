import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { fmtDate, fullName } from '@/lib/format';
import { normaliseCode } from '@/lib/verify';
import { Verification } from '@/models';
import { Badge, Card, EmptyState, PageHeader, StatCard, PageSkeleton } from '@/components/ui';

export const metadata: Metadata = { title: 'Issued documents' };

type Row = {
  _id: Types.ObjectId; code: string; kind: string; issuedTo: string; createdAt: Date; expiresAt: Date;
  revoked: boolean; revokedReason?: string; lookups: number;
  issuedBy: { name: string };
  record: { _id: Types.ObjectId; degree: string; student: { matricNo: string; surname: string; otherNames: string } };
};

export default function TranscriptsPage(props: PageProps<'/transcripts'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TranscriptsPageContent {...props} />
    </Suspense>
  );
}

async function TranscriptsPageContent({ searchParams }: PageProps<'/transcripts'>) {
  await requirePage('transcript:issue');
  const { code } = await searchParams;
  await db();
  const filter = typeof code === 'string' && normaliseCode(code) ? { code: normaliseCode(code) } : {};
  const [rows, total, revoked, lookups] = await Promise.all([
    Verification.find(filter).sort({ createdAt: -1 }).limit(100)
      .populate('issuedBy', 'name')
      .populate({ path: 'record', select: 'degree student', populate: { path: 'student', select: 'matricNo surname otherNames' } })
      .lean<Row[]>(),
    Verification.countDocuments(),
    Verification.countDocuments({ revoked: true }),
    Verification.aggregate<{ n: number }>([{ $group: { _id: null, n: { $sum: '$lookups' } } }]),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Issued documents"
        description="Statements of result and transcripts carry a verification code and QR. Issue new documents from a graduand's record page."
        actions={<Link href="/records?locked=1" className="btn-primary">Find a record to issue</Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Documents issued" value={total} tone="brand" />
        <StatCard label="Revoked" value={revoked} tone="danger" />
        <StatCard label="Public verifications" value={lookups[0]?.n ?? 0} tone="accent" hint="Lookups on the verify page" />
      </div>
      <Card title="Register" actions={
        <form className="flex gap-2"><input name="code" defaultValue={typeof code === 'string' ? code : ''} placeholder="Find code" className="input w-36 py-1 font-mono text-xs uppercase" /><button className="btn-outline py-1 text-xs">Find</button></form>
      } bodyClass="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Code</th><th>Graduand</th><th>Type</th><th>Issued to</th><th>Issued</th><th className="text-right">Lookups</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v._id.toString()}>
                    <td className="font-mono text-xs">{v.code}</td>
                    <td>
                      <Link className="link" href={`/records/${v.record._id}`}>{fullName(v.record.student)}</Link>
                      <div className="text-xs text-muted">{v.record.student.matricNo}</div>
                    </td>
                    <td>{v.kind === 'TRANSCRIPT' ? 'Transcript' : 'Statement'}</td>
                    <td>{v.issuedTo}</td>
                    <td className="text-xs">{fmtDate(v.createdAt)}<div className="text-muted">{v.issuedBy?.name}</div></td>
                    <td className="text-right tabular-nums">{v.lookups}</td>
                    <td>
                      {v.revoked ? <span title={v.revokedReason}><Badge tone="danger">Revoked</Badge></span>
                        : v.expiresAt < now ? <Badge>Expired</Badge> : <Badge tone="success">Valid to {fmtDate(v.expiresAt)}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No documents issued yet" />}
      </Card>
    </>
  );
}
