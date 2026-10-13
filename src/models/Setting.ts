import { Schema, model, models, type Model } from 'mongoose';

/** Small key/value store for system-wide settings edited by the administrator. */
type SettingDoc = { _id: string; value: unknown; updatedBy?: unknown; updatedAt?: Date };

const SettingSchema = new Schema<SettingDoc>({
  _id:       { type: String },
  value:     { type: Schema.Types.Mixed, required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false });

export default (models.Setting as Model<SettingDoc>) || model<SettingDoc>('Setting', SettingSchema);
