import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const StudentSchema = new Schema({
  matricNo:   { type: String, required: true, unique: true, uppercase: true, trim: true },
  surname:    { type: String, required: true, trim: true },
  otherNames: { type: String, required: true, trim: true },
  sex:        { type: String, enum: ['M', 'F'] },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme' },
}, { timestamps: true });

StudentSchema.index({ surname: 'text', otherNames: 'text', matricNo: 'text' });

export type StudentDoc = InferSchemaType<typeof StudentSchema> & { _id: Types.ObjectId };
export default (models.Student as Model<StudentDoc>) || model<StudentDoc>('Student', StudentSchema);
