import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const AcademicSessionSchema = new Schema({
  label:     { type: String, required: true, unique: true },  // '2019/2020'
  startYear: { type: Number, required: true, index: true },
}, { timestamps: true });

export type AcademicSessionDoc = InferSchemaType<typeof AcademicSessionSchema> & { _id: Types.ObjectId };
export default (models.AcademicSession as Model<AcademicSessionDoc>) ||
  model<AcademicSessionDoc>('AcademicSession', AcademicSessionSchema);
