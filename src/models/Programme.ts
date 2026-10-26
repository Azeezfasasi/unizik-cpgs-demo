import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const ProgrammeSchema = new Schema({
  name:       { type: String, required: true, trim: true },   // e.g. 'M.Sc. Agricultural Extension'
  code:       { type: String, required: true, unique: true, uppercase: true, trim: true },
  /** Code of a degree in Academic structure → Degrees (checked when a programme is saved). */
  degreeType: { type: String, required: true, trim: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
}, { timestamps: true });

export type ProgrammeDoc = InferSchemaType<typeof ProgrammeSchema> & { _id: Types.ObjectId };
export default (models.Programme as Model<ProgrammeDoc>) || model<ProgrammeDoc>('Programme', ProgrammeSchema);
