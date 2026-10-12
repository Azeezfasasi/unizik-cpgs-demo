import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';
import { CLASS_OF_DEGREE } from '@/lib/grading';

const CourseSchema = new Schema({
  code: String, title: String, units: Number, score: Number, grade: String,
}, { _id: false });

const VersionSchema = new Schema({
  version:   Number,
  data:      Schema.Types.Mixed,
  amendment: { type: Types.ObjectId, ref: 'Amendment' },
  at:        { type: Date, default: Date.now },
}, { _id: false });

const GraduandRecordSchema = new Schema({
  student:    { type: Types.ObjectId, ref: 'Student', required: true, index: true },
  sheet:      { type: Types.ObjectId, ref: 'ResultSheet', required: true, index: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme', required: true },
  session:    { type: Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
  origin:     { type: String, enum: ['LEGACY', 'ONLINE'], required: true },
  degree:     { type: String, required: true },
  cgpa:       { type: Number, min: 0, max: 5 },
  classOfDegree: { type: String, enum: CLASS_OF_DEGREE },
  thesisTitle: String,
  supervisor:  String,
  senateApprovalDate: Date,
  courses:    [CourseSchema],
  sourceFile: { type: Types.ObjectId, ref: 'StoredFile' },
  sourcePage: Number,
  illegible:  { type: Boolean, default: false },
  locked:     { type: Boolean, default: false, index: true },
  version:    { type: Number, default: 1 },
  /** Earlier versions, kept readable after an amendment. */
  history:    [VersionSchema],
  remarks:    String,
}, { timestamps: true });

GraduandRecordSchema.index({ student: 1, programme: 1, session: 1 }, { unique: true });
GraduandRecordSchema.index({ thesisTitle: 'text' });

export type GraduandRecordDoc = InferSchemaType<typeof GraduandRecordSchema> & { _id: Types.ObjectId };
export default (models.GraduandRecord as Model<GraduandRecordDoc>) ||
  model<GraduandRecordDoc>('GraduandRecord', GraduandRecordSchema);
