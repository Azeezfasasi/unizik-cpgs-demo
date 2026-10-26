import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { buildUserTemplate } from '@/lib/user-import';

/** Staff accounts template, with the current faculty and department codes on a "Codes" sheet. */
export const GET = handle(async () => {
  await requirePermission('user:manage');
  await db();
  return new Response(new Uint8Array(await buildUserTemplate()), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="CRR-staff-accounts-template.xlsx"',
      'cache-control': 'no-store',
    },
  });
});
