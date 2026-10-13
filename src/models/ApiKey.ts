import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

/**
 * Credential for another application. A key acts as its owner (a staff account) with exactly
 * that account's role and department scope. Only a SHA-256 hash of the secret is stored.
 */
const ApiKeySchema = new Schema({
  name:       { type: String, required: true, trim: true },   // e.g. "Library clearance system"
  keyId:      { type: String, required: true, unique: true },  // public part, used for lookup
  hash:       { type: String, required: true, select: false },
  owner:      { type: Types.ObjectId, ref: 'User', required: true, index: true },
  createdBy:  { type: Types.ObjectId, ref: 'User', required: true },
  expiresAt:  Date,
  revokedAt:  Date,
  lastUsedAt: Date,
  lastUsedIp: String,
  useCount:   { type: Number, default: 0 },
}, { timestamps: true });

export type ApiKeyDoc = InferSchemaType<typeof ApiKeySchema> & { _id: Types.ObjectId };
export default (models.ApiKey as Model<ApiKeyDoc>) || model<ApiKeyDoc>('ApiKey', ApiKeySchema);
