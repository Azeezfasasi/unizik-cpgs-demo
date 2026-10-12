import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { PublicFooter } from '@/components/PublicFooter';

export const metadata: Metadata = { title: 'Privacy notice' };

export default function PrivacyPage() {
  const dpo = process.env.NEXT_PUBLIC_DPO_EMAIL ?? 'dpo@unizik.edu.ng';
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy"><div className="mx-auto max-w-3xl px-4 py-4"><Link href="/"><Logo light /></Link></div></header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <article className="card space-y-5 p-8 text-sm leading-relaxed">
          <h1 className="text-2xl font-semibold text-navy">Privacy notice: CPGS Results Repository</h1>
          <p>The College of Postgraduate Studies (CPGS), Nnamdi Azikiwe University, Awka, processes postgraduate result records in this repository under the Nigeria Data Protection Act 2023. This notice explains what is held, why and for how long.</p>
          <h2 className="text-base font-semibold text-navy">What we hold</h2>
          <p>For each graduand: matriculation number, name, sex, programme, department, session, courses and scores, CGPA, class of degree, thesis title, supervisor, Senate approval date and scans of the signed result sheets. We do not hold phone numbers or home addresses in this system. For staff users: name, official email, role, unit and an activity log.</p>
          <h2 className="text-base font-semibold text-navy">Why</h2>
          <p>To keep the authoritative academic record of the University (a public-interest and legal obligation), to issue statements of result and transcripts, and to let third parties confirm that a document is genuine.</p>
          <h2 className="text-base font-semibold text-navy">Verification</h2>
          <p>The public verification page shows only the graduand&apos;s name, degree, class of degree, session, Senate approval date and the document&apos;s issue and validity dates. It never shows scores, scans or contact details. Each lookup is logged.</p>
          <h2 className="text-base font-semibold text-navy">Retention</h2>
          <p>Academic records are kept permanently. Audit logs are kept for at least seven years. Verification metadata is deleted after its retention period ends.</p>
          <h2 className="text-base font-semibold text-navy">Security</h2>
          <p>Access is limited to authorised staff with two-step verification, scoped to their department or faculty. Files are stored privately and opened only through short-lived signed links. Every view, download and change is recorded in a tamper-evident audit trail.</p>
          <h2 className="text-base font-semibold text-navy">Your rights and contact</h2>
          <p>Graduands may request access to or correction of their record. Corrections to final results follow the University&apos;s amendment procedure. Contact the Data Protection Officer at <a className="link" href={`mailto:${dpo}`}>{dpo}</a>.</p>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
