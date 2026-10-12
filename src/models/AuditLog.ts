import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const AuditLogSchema = new Schema({
  seq:       { type: Number, required: true, unique: true },
  at:        { type: Date, required: true, index: true },
  actor:     { type: Types.ObjectId, ref: 'User', index: true },
  actorName: String,
  action:    { type: String, required: true, index: true },   // 'record.view', 'sheet.decide'
  entity:    String,
  entityId:  { type: String, index: true },
  before:    Schema.Types.Mixed,
  after:     Schema.Types.Mixed,
  ip:        String,
  userAgent: String,
  prevHash:  { type: String, required: true },
  hash:      { type: String, required: true },
}, { versionKey: false });

function appendOnly() {
  throw new Error('AuditLog is append-only');
}
AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'], appendOnly);

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & { _id: Types.ObjectId };
export default (models.AuditLog as Model<AuditLogDoc>) || model<AuditLogDoc>('AuditLog', AuditLogSchema);

/** Head of the hash chain, advanced with optimistic concurrency so concurrent writes never fork it. */
type AuditHeadDoc = { _id: string; seq: number; hash: string };
const AuditHeadSchema = new Schema<AuditHeadDoc>({
  _id:  { type: String, default: 'head' },
  seq:  { type: Number, default: 0 },
  hash: { type: String, default: 'GENESIS' },
}, { versionKey: false });

export const AuditHead = (models.AuditHead as Model<AuditHeadDoc>) || model<AuditHeadDoc>('AuditHead', AuditHeadSchema);
