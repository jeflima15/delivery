import mongoose, { Schema } from 'mongoose';

const masterSettingsSchema = new Schema({
  key: { type: String, default: 'global', unique: true },
  platformName: { type: String, default: 'Delivery Platform', trim: true },
  timezone: { type: String, default: 'America/Sao_Paulo' },
  currency: { type: String, enum: ['BRL'], default: 'BRL' },
  defaultPeriod: { type: String, enum: ['today', '7d', '30d', 'current_month', 'previous_month', 'current_year'], default: '30d' },
  defaultPageSize: { type: Number, min: 10, max: 100, default: 25 },
  featureLabels: { type: Map, of: String, default: {} },
  limitLabels: { type: Map, of: String, default: {} },
}, { timestamps: true });

export default ((mongoose.models.MasterSettings) || mongoose.model('MasterSettings', masterSettingsSchema)) as mongoose.Model<Record<string, unknown>>;
