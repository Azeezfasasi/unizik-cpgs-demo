import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const ChangeSchema = new Schema({
  field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed,
}, { _id: false });

const AmendmentSchema = new Schema({
  record:      { type: Types.ObjectId, ref: 'GraduandRecord', required: true, index: true },
  changes:     [ChangeSchema],
  reason:      { type: String, required: true },
  evidence:    { type: Types.ObjectId, ref: 'StoredFile' },
  status:      { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  requestedBy: { type: Types.ObjectId, ref: 'User', required: true },
  decidedBy:   { type: Types.ObjectId, ref: 'User' },
  decidedAt:   Date,
  decisionComment: String,
}, { timestamps: true });

export type AmendmentDoc = InferSchemaType<typeof AmendmentSchema> & { _id: Types.ObjectId };
export default (models.Amendment as Model<AmendmentDoc>) || model<AmendmentDoc>('Amendment', AmendmentSchema);
