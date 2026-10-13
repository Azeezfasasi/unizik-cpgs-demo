import { requirePermission } from '@/lib/auth';
import { getGradingBands } from '@/lib/settings';
import { CLASS_LABELS } from '@/lib/grading';
import { fromAction, json, readJson, toForm, v1 } from '@/lib/v1';
import { saveGradingBands } from '@/app/(portal)/admin/actions';

const view = async () => {
  const g = await getGradingBands();
  return { bands: g.bands.map((b) => ({ class: b.cls, label: CLASS_LABELS[b.cls], minCgpa: b.min })), official: g.saved, updatedAt: g.updatedAt ?? null };
};

/** Class-of-degree bands used by the CGPA/class checks. */
export const GET = v1(async () => {
  await requirePermission();
  return json({ data: await view() });
});

/** Replace the bands. Body: { DISTINCTION, CREDIT, MERIT, PASS } minimum CGPAs; Fail is always 0. */
export const PUT = v1(async (req: Request) => {
  await requirePermission('structure:manage');
  const res = await saveGradingBands({}, toForm(await readJson(req)));
  if (!res.ok) return fromAction(res);
  return json({ ok: true, message: res.message, data: await view() });
});
