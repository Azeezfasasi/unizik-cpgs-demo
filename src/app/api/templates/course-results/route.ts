import { requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { buildCourseResultsTemplate } from '@/lib/course-results-import';

/** Bulk course results template: one row per course, for many students. */
export const GET = handle(async () => {
  await requirePermission('amendment:request');
  return new Response(new Uint8Array(buildCourseResultsTemplate()), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="CRR-course-results-template.xlsx"',
      'cache-control': 'no-store',
    },
  });
});
