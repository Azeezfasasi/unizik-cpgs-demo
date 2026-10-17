import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

export const BATCH_STATUS = ['INVENTORIED', 'IN_PROGRESS', 'COMPLETED'] as const;
export const BOX_CONDITION = ['GOOD', 'FAIR', 'DAMAGED', 'SEVERELY_DAMAGED'] as const;

const DigitizationBatchSchema = new Schema({
  boxCode:     { type: String, required: true, unique: true, uppercase: true },  // CRR-BOX-0042
  /** Set when the box holds one department's files (all boxes created before multi-department boxes). */
  department:  { type: Types.ObjectId, ref: 'Department', index: true },
  /** Departments whose files are in the box. */
  departments: { type: [{ type: Types.ObjectId, ref: 'Department' }], default: undefined, index: true },
  /** The box holds files for any department, e.g. PG Board result lists. */
  allDepartments: { type: Boolean, default: false },
  sessions:    [{ type: Types.ObjectId, ref: 'AcademicSession' }],
  estimatedSheets: { type: Number, default: 0 },
  condition:   { type: String, enum: BOX_CONDITION, default: 'FAIR' },
  priority:    { type: Number, default: 3, min: 1, max: 5 },   // 1 = most urgent
  location:    String,
  notes:       String,
  indexer:     { type: Types.ObjectId, ref: 'User', index: true },
  reviewer:    { type: Types.ObjectId, ref: 'User', index: true },
  status:      { type: String, enum: BATCH_STATUS, default: 'INVENTORIED', index: true },
  createdBy:   { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export type DigitizationBatchDoc = InferSchemaType<typeof DigitizationBatchSchema> & { _id: Types.ObjectId };
export default (models.DigitizationBatch as Model<DigitizationBatchDoc>) ||
  model<DigitizationBatchDoc>('DigitizationBatch', DigitizationBatchSchema);
