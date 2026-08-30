import { Schema, model } from 'mongoose';
import { IClientProfile, IClientProfileModel, INotificationPreferences } from './client-profile.interface';

const notificationPreferencesSchema = new Schema<INotificationPreferences>(
  {
    enableNotifications: { type: Boolean, default: true },
    bookingAlerts: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
  },
  { _id: false }
);

const clientProfileSchema = new Schema<IClientProfile, IClientProfileModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    medicalConditionsAndAllergies: {
      type: String,
      trim: true,
      default: null,
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

export const ClientProfile = model<IClientProfile, IClientProfileModel>(
  'ClientProfile',
  clientProfileSchema
);