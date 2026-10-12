import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const FacultySchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
}, { timestamps: true });

export type FacultyDoc = InferSchemaType<typeof FacultySchema> & { _id: Types.ObjectId };
export default (models.Faculty as Model<FacultyDoc>) || model<FacultyDoc>('Faculty', FacultySchema);
