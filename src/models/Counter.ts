import { Schema, model, models, type Model } from 'mongoose';

type CounterDoc = { _id: string; seq: number };
const CounterSchema = new Schema<CounterDoc>({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
const Counter = (models.Counter as Model<CounterDoc>) || model<CounterDoc>('Counter', CounterSchema);

export async function nextSeq(name: string) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return c!.seq;
}

/** CPGS/RS/2026/000123 */
export async function nextSheetReference() {
  const year = new Date().getFullYear();
  const n = await nextSeq(`sheet-${year}`);
  return `CPGS/RS/${year}/${String(n).padStart(6, '0')}`;
}
