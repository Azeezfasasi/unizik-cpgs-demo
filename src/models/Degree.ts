import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

/**
 * A degree the College awards (PGD, MSc, PhD…), managed in Academic structure. Programmes refer to
 * it by `code` (their `degreeType`).
 */
const DegreeSchema = new Schema({
  /** Short code stored on programmes, e.g. "MSc". Not changed once programmes use it. */
  code:       { type: String, required: true, unique: true, trim: true },
  /** Full name printed on statements and transcripts, e.g. "Master of Science". */
  name:       { type: String, required: true, trim: true },
  /** Other spellings recognised in imports and PG Board lists, e.g. "M.Sc.", "MSC". */
  aliases:    { type: [String], default: [] },
  /** Whether results carry a class of degree (Distinction, Credit…); PhD does not. */
  classified: { type: Boolean, default: true },
  /** Display order in lists. */
  order:      { type: Number, default: 0 },
}, { timestamps: true });

export type DegreeDoc = InferSchemaType<typeof DegreeSchema> & { _id: Types.ObjectId };
export default (models.Degree as Model<DegreeDoc>) || model<DegreeDoc>('Degree', DegreeSchema);
