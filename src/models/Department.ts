import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const DepartmentSchema = new Schema({
  name:    { type: String, required: true, trim: true },
  code:    { type: String, required: true, unique: true, uppercase: true, trim: true },
  faculty: { type: Types.ObjectId, ref: 'Faculty', required: true, index: true },
  /** Optional regex the department's matric numbers must match. */
  matricPattern: String,
}, { timestamps: true });

export type DepartmentDoc = InferSchemaType<typeof DepartmentSchema> & { _id: Types.ObjectId };
export default (models.Department as Model<DepartmentDoc>) || model<DepartmentDoc>('Department', DepartmentSchema);
