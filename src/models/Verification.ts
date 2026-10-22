import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

const VerificationSchema = new Schema({
  record:    { type: Types.ObjectId, ref: 'GraduandRecord', required: true, index: true },
  kind:      { type: String, enum: ['STATEMENT_OF_RESULT', 'TRANSCRIPT'], required: true },
  code:      { type: String, required: true, unique: true },
  hmac:      { type: String, required: true },
  recordVersion: { type: Number, required: true },
  issuedTo:  { type: String, required: true },     // requesting party, e.g. an employer or the graduand
  /** Postal address of the receiving institution, printed on the transcript forwarding letter. */
  issuedToAddress: String,
  /** Letter reference printed on the document, e.g. NAU/CPGS/R/ST/001/165 (documents issued before it existed have none). */
  reference: String,
  /** Letterhead officers and signatory at the time of issue, so a re-download prints the same letter. */
  letterhead: Schema.Types.Mixed,
  issuedBy:  { type: Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  revoked:   { type: Boolean, default: false },
  revokedAt: Date,
  revokedReason: String,
  lookups:   { type: Number, default: 0 },
}, { timestamps: true });

export type VerificationDoc = InferSchemaType<typeof VerificationSchema> & { _id: Types.ObjectId };
export default (models.Verification as Model<VerificationDoc>) ||
  model<VerificationDoc>('Verification', VerificationSchema);
