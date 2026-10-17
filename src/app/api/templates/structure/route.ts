import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { buildStructureFile, currentStructureRows } from '@/lib/structure-import';

/**
 * Academic structure import template: Excel (default) or CSV (`?format=csv`).
 * With `?current=1` it is filled with the existing faculties, departments and programmes.
 */
export const GET = handle(async (req: Request) => {
  await requirePermission('structure:manage');
  const url = new URL(req.url);
  const csv = url.searchParams.get('format') === 'csv';
  const current = url.searchParams.get('current') === '1';
  let rows: string[][] | undefined;
  if (current) {
    await db();
    rows = await currentStructureRows();
  }
  const name = `CRR-structure-${current ? `current-${new Date().toISOString().slice(0, 10)}` : 'template'}`;
  if (csv) {
    return new Response(buildStructureFile('csv', rows) as string, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'no-store' },
    });
  }
  return new Response(new Uint8Array(buildStructureFile('xlsx', rows) as Buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
});
