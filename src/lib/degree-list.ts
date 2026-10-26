import 'server-only';
import { db } from './db';
import { degreeKey, type DegreeDef } from './degrees';
import Degree from '@/models/Degree';

/** The degrees the system started with; saved to the database the first time the list is read. */
export const DEFAULT_DEGREES: Required<DegreeDef>[] = [
  { code: 'PGD', name: 'Postgraduate Diploma', aliases: ['PGDip', 'PG Diploma'], classified: true },
  { code: 'MA', name: 'Master of Arts', aliases: ['M.A.'], classified: true },
  { code: 'MSc', name: 'Master of Science', aliases: ['M.Sc.'], classified: true },
  { code: 'MEd', name: 'Master of Education', aliases: ['M.Ed.'], classified: true },
  { code: 'MBA', name: 'Master of Business Administration', aliases: [], classified: true },
  { code: 'LLM', name: 'Master of Laws', aliases: ['LL.M.'], classified: true },
  { code: 'MPhil', name: 'Master of Philosophy', aliases: ['M.Phil.'], classified: true },
  { code: 'PhD', name: 'Doctor of Philosophy', aliases: ['Ph.D.', 'DPhil'], classified: false },
];

export type DegreeItem = Required<DegreeDef> & { id: string; order: number };

/** The managed degrees in display order; the defaults are saved on first use. */
export async function getDegrees(): Promise<DegreeItem[]> {
  await db();
  let list = await Degree.find().sort({ order: 1, code: 1 }).lean();
  if (!list.length) {
    await Degree.insertMany(DEFAULT_DEGREES.map((d, i) => ({ ...d, order: i + 1 })), { ordered: false }).catch(() => {
      // Another request saved them at the same moment; read what is there.
    });
    list = await Degree.find().sort({ order: 1, code: 1 }).lean();
  }
  return list.map((d) => ({
    id: d._id.toString(), code: d.code, name: d.name, aliases: d.aliases ?? [], classified: d.classified !== false, order: d.order ?? 0,
  }));
}

/** The degree a code or spelling refers to ("m.sc" → MSc), or null. */
export function findDegree(text: string, degrees: DegreeDef[]) {
  const k = degreeKey(text);
  if (!k) return null;
  return degrees.find((d) => [d.code, ...(d.aliases ?? [])].some((s) => degreeKey(s) === k)) ?? null;
}

/** Whether results of this degree carry a class of degree (unknown codes do). */
export async function isClassified(code: string) {
  const d = (await getDegrees()).find((x) => x.code === code);
  return d ? d.classified : true;
}
