import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

export const SHEET_STATUS = [
  'DRAFT', 'SUBMITTED', 'HOD_APPROVED', 'FACULTY_APPROVED', 'RECORDS_VERIFIED',
  'PROVOST_APPROVED', 'SENATE_APPROVED', 'RETURNED',
  'INDEXED', 'QA_PASSED', 'LOCKED',            // legacy path
] as const;
export type SheetStatus = (typeof SHEET_STATUS)[number];

const ApprovalSchema = new Schema({
  stage:   String,
  action:  { type: String, enum: ['SUBMIT', 'APPROVE', 'RETURN', 'LOCK'] },
  by:      { type: Types.ObjectId, ref: 'User' },
  byName:  String,
  at:      { type: Date, default: Date.now },
  comment: String,
}, { _id: false });

const ResultSheetSchema = new Schema({
  origin:     { type: String, enum: ['LEGACY', 'ONLINE'], required: true },
  reference:  { type: String, unique: true, required: true },   // CPGS/RS/2026/000123
  department: { type: Types.ObjectId, ref: 'Department', required: true, index: true },
  programme:  { type: Types.ObjectId, ref: 'Programme', required: true },
  session:    { type: Types.ObjectId, ref: 'AcademicSession', required: true },
  status:     { type: String, enum: SHEET_STATUS, default: 'DRAFT', index: true },
  statusSince:{ type: Date, default: Date.now },
  files:      [{ type: Types.ObjectId, ref: 'StoredFile' }],
  batch:      { type: Types.ObjectId, ref: 'DigitizationBatch', index: true },
  approvals:  [ApprovalSchema],
  recordCount:{ type: Number, default: 0 },
  /** Row snapshots at the last two submissions, so approvers see what changed on resubmission. */
  lastSubmittedRows: Schema.Types.Mixed,
  previousSubmittedRows: Schema.Types.Mixed,
  senateApprovalDate: Date,
  createdBy:  { type: Types.ObjectId, ref: 'User', required: true },
  remindedAt: Date,
}, { timestamps: true });

export type ResultSheetDoc = InferSchemaType<typeof ResultSheetSchema> & { _id: Types.ObjectId };
export default (models.ResultSheet as Model<ResultSheetDoc>) || model<ResultSheetDoc>('ResultSheet', ResultSheetSchema);
