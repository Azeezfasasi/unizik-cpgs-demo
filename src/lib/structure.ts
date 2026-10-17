import 'server-only';
import { Types, type Model } from 'mongoose';
import {
  Department, DigitizationBatch, GraduandRecord, Programme, ResultSheet, Student, StoredFile, User,
} from '@/models';

export type StructureKind = 'faculty' | 'department' | 'programme' | 'session';

/** What still refers to an item, e.g. { 'graduand record': 12 }. Empty means it is safe to delete. */
export type Usage = Record<string, number>;

type Ref = { label: string; model: Model<never>; field: string };

const m = (x: unknown) => x as Model<never>;

/** Every collection that points at each kind of structure item. */
const REFS: Record<StructureKind, Ref[]> = {
  faculty: [
    { label: 'department', model: m(Department), field: 'faculty' },
    { label: 'staff account', model: m(User), field: 'faculty' },
  ],
  department: [
    { label: 'programme', model: m(Programme), field: 'department' },
    { label: 'student', model: m(Student), field: 'department' },
    { label: 'graduand record', model: m(GraduandRecord), field: 'department' },
    { label: 'result sheet', model: m(ResultSheet), field: 'department' },
    { label: 'box', model: m(DigitizationBatch), field: 'department' },
    { label: 'box', model: m(DigitizationBatch), field: 'departments' },
    { label: 'staff account', model: m(User), field: 'department' },
    { label: 'file', model: m(StoredFile), field: 'department' },
  ],
  programme: [
    { label: 'graduand record', model: m(GraduandRecord), field: 'programme' },
    { label: 'result sheet', model: m(ResultSheet), field: 'programme' },
    { label: 'student', model: m(Student), field: 'programme' },
  ],
  session: [
    { label: 'graduand record', model: m(GraduandRecord), field: 'session' },
    { label: 'result sheet', model: m(ResultSheet), field: 'session' },
    { label: 'box', model: m(DigitizationBatch), field: 'sessions' },
  ],
};

/** Usage of every item of a kind, using one grouped count per referencing collection. */
export async function usageMap(kind: StructureKind, ids?: Types.ObjectId[]) {
  const map = new Map<string, Usage>();
  await Promise.all(REFS[kind].map(async ({ label, model, field }) => {
    const match = ids ? { [field]: { $in: ids } } : { [field]: { $ne: null } };
    const rows = await model.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: match },
      ...(field === 'sessions' || field === 'departments' ? [{ $unwind: `$${field}` }] : []),
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
    ]);
    for (const r of rows) {
      const key = String(r._id);
      // Several fields can count the same kind of item (a box's department or departments).
      map.set(key, { ...map.get(key), [label]: (map.get(key)?.[label] ?? 0) + r.n });
    }
  }));
  return map;
}

export async function usageOf(kind: StructureKind, id: string) {
  return (await usageMap(kind, [new Types.ObjectId(id)])).get(id) ?? {};
}

export function describeUsage(u: Usage) {
  const plural = (s: string) => (s.endsWith('x') ? `${s}es` : `${s}s`);
  return Object.entries(u).map(([k, n]) => `${n} ${n === 1 ? k : plural(k)}`).join(', ');
}
