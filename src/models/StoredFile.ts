import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';

export const FILE_PURPOSES = ['LEGACY_SCAN', 'SUBMISSION_SCAN', 'AMENDMENT_EVIDENCE'] as const;

const StoredFileSchema = new Schema({
  storage:      { type: String, enum: ['cloudinary', 'local'], required: true },
  publicId:     { type: String, required: true, unique: true },
  resourceType: { type: String, default: 'image' },
  format:       String,
  originalName: String,
  bytes:        Number,
  pages:        Number,
  sha256:       { type: String, required: true },
  department:   { type: Types.ObjectId, ref: 'Department', index: true },
  purpose:      { type: String, enum: FILE_PURPOSES, required: true },
  uploadedBy:   { type: Types.ObjectId, ref: 'User', required: true },
  backedUpAt:   Date,
}, { timestamps: true });

export type StoredFileDoc = InferSchemaType<typeof StoredFileSchema> & { _id: Types.ObjectId };
export default (models.StoredFile as Model<StoredFileDoc>) || model<StoredFileDoc>('StoredFile', StoredFileSchema);
