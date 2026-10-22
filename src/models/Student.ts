import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const StudentSchema = new Schema({
  matricNo:   { type: String, required: true, unique: true, uppercase: true, trim: true },
  surname:    { type: String, required: true, trim: true },
  otherNames: { type: String, required: true, trim: true },
  sex:        { type: String, enum: ['M', 'F'] },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme' },
  // Printed on the academic transcript (SPGS Form 044); entered by the Records Unit when issuing one.
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  address:      { type: String, trim: true },
  modeOfStudy:  { type: String, enum: ['FULL_TIME', 'PART_TIME'] },
  dateRegistered: Date,
  /** Basis of admission: qualification and class, when obtained, and where. */
  admission: {
    type: [new Schema({ qualification: String, date: String, institution: String }, { _id: false })],
    default: undefined,
  },
}, { timestamps: true });

StudentSchema.index({ surname: 'text', otherNames: 'text', matricNo: 'text' });

export type StudentDoc = InferSchemaType<typeof StudentSchema> & { _id: Types.ObjectId };
export default (models.Student as Model<StudentDoc>) || model<StudentDoc>('Student', StudentSchema);
