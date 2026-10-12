import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

export const DEGREE_TYPES = ['PGD', 'MA', 'MSc', 'MEd', 'MBA', 'LLM', 'MPhil', 'PhD'] as const;

const ProgrammeSchema = new Schema({
  name:       { type: String, required: true, trim: true },   // e.g. 'M.Sc. Agricultural Extension'
  code:       { type: String, required: true, unique: true, uppercase: true, trim: true },
  degreeType: { type: String, enum: DEGREE_TYPES, required: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
}, { timestamps: true });

export type ProgrammeDoc = InferSchemaType<typeof ProgrammeSchema> & { _id: Types.ObjectId };
export default (models.Programme as Model<ProgrammeDoc>) || model<ProgrammeDoc>('Programme', ProgrammeSchema);
