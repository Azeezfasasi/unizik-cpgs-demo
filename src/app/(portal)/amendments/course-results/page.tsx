import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePage } from '@/lib/auth';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { BulkCourseResults } from './BulkCourseResults';

export const metadata: Metadata = { title: 'Bulk course results' };

export default function BulkCourseResultsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requirePage('amendment:request');
  return (
    <>
      <PageHeader
        back={{ href: '/amendments', label: 'Amendments' }}
        title="Bulk course results"
        description="Add course results for many students at once from their Student's Final Result sheets. Each student becomes a request to the Provost with their scanned sheet; once approved, the courses print on the transcript."
      />
      <Card title="1. Fill in the template">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li><a href="/api/templates/course-results" className="link">Download the template</a> (Excel).</li>
          <li>One row per course: Matric No, Course Code, Course Title, Credit, Grade (A–F) and Semester (1–4, or P for the project / thesis / dissertation).</li>
          <li>A student&rsquo;s courses in the file replace any already on their record. Only locked records can be updated here.</li>
        </ol>
      </Card>
      <div className="mt-6">
        <Card title="2. Check, attach scans and send">
          <BulkCourseResults />
        </Card>
      </div>
    </>
  );
}
