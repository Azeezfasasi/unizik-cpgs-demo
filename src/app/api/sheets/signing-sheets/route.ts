import { Types } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canView } from '@/lib/sheet-access';
import { buildSigningSheet } from '@/lib/signing-pdf';
import { fail } from '@/lib/errors';
import { ResultSheet } from '@/models';

const MAX = 100;

/**
 * Several sheets for signing (certified transcriptions for legacy sheets) as one PDF, each sheet on
 * its own pages, for printing in one go. Query: ids=<id>,<id>,… (up to 100). Sheets without rows,
 * or that the user cannot open, are left out.
 */
export const GET = handle(async (req: Request) => {
  const user = await requirePermission();
  const ids = [...new Set((new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((v) => Types.ObjectId.isValid(v)))];
  if (!ids.length) fail('Select at least one sheet');
  if (ids.length > MAX) fail(`Select at most ${MAX} sheets at a time`);
  await db();
  const sheets = (await ResultSheet.find({ _id: { $in: ids } }).lean())
    .sort((a, b) => a.reference.localeCompare(b.reference));

  const merged = await PDFDocument.create();
  merged.setTitle(`Sheets for signing (${sheets.length})`);
  merged.setAuthor('College of Postgraduate Studies, Nnamdi Azikiwe University');
  const included: { reference: string; fingerprint: string }[] = [];
  // Build a few at a time (each needs several reads), then append in reference order.
  const built: (Awaited<ReturnType<typeof buildSigningSheet>> | null)[] = new Array(sheets.length).fill(null);
  for (let i = 0; i < sheets.length; i += 4) {
    await Promise.all(sheets.slice(i, i + 4).map(async (s, j) => {
      if (await canView(user, s)) built[i + j] = await buildSigningSheet(s);
    }));
  }
  for (const [i, doc] of built.entries()) {
    if (!doc) continue;
    const src = await PDFDocument.load(doc.bytes);
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
    included.push({ reference: sheets[i].reference, fingerprint: doc.fingerprint });
  }
  if (!included.length) fail('None of the selected sheets has graduand rows yet');

  await audit(user, 'sheet.signing_sheets', 'ResultSheet', undefined, undefined, { sheets: included });
  const bytes = await merged.save();
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="sheets-for-signing-${new Date().toISOString().slice(0, 10)}-${included.length}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});
