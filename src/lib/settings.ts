import 'server-only';
import { db } from './db';
import { DEFAULT_BANDS, type Band } from './grading';
import Setting from '@/models/Setting';

export const GRADING_KEY = 'gradingBands';

/** The class-of-degree bands in force: the saved table, or the defaults until one is saved. */
export async function getGradingBands(): Promise<{ bands: Band[]; saved: boolean; updatedAt?: Date }> {
  await db();
  const s = await Setting.findById(GRADING_KEY).lean();
  const bands = Array.isArray(s?.value) ? (s.value as Band[]) : null;
  return bands?.length
    ? { bands: [...bands].sort((a, b) => b.min - a.min), saved: true, updatedAt: s?.updatedAt }
    : { bands: DEFAULT_BANDS, saved: false };
}
