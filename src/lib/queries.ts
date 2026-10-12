import 'server-only';
import type { SheetRow } from '@/components/SheetTable';
import { ResultSheet } from '@/models';

type Populated = {
  _id: { toString(): string }; reference: string; origin: string; status: string; recordCount?: number | null;
  statusSince?: Date | null; programme?: { name: string }; department?: { name: string };
  session?: { label: string }; batch?: { boxCode: string };
};

/** Loads result sheets with their names resolved, newest activity first. */
export async function listSheets(filter: Record<string, unknown>, limit = 200): Promise<SheetRow[]> {
  const docs = await ResultSheet.find(filter)
    .sort({ statusSince: -1 })
    .limit(limit)
    .populate('programme', 'name')
    .populate('department', 'name')
    .populate('session', 'label')
    .populate('batch', 'boxCode')
    .lean<Populated[]>();
  return docs.map((s) => ({
    id: s._id.toString(), reference: s.reference, origin: s.origin, status: s.status,
    programme: s.programme?.name, department: s.department?.name, session: s.session?.label,
    recordCount: s.recordCount ?? 0, statusSince: s.statusSince, boxCode: s.batch?.boxCode,
  }));
}
