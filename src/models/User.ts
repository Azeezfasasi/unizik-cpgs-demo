import { Schema, model, models, Types, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '@/lib/rbac';

const UserSchema = new Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  role:       { type: String, enum: ROLES, required: true },
  faculty:    { type: Types.ObjectId, ref: 'Faculty' },
  department: { type: Types.ObjectId, ref: 'Department' },
  passwordHash: { type: String, required: true, select: false },
  mfaSecret:    { type: String, select: false },
  mfaPendingSecret: { type: String, select: false },
  mfaEnabled: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  Date,
  lastLoginAt:  Date,
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
export default (models.User as Model<UserDoc>) || model<UserDoc>('User', UserSchema);
