import { Schema, model } from 'mongoose';
import { VERIFICATION_STATUS } from '../../../enums/user';
import { ICaregiverProfile } from './caregiver-profile.interface';

const caregiverProfileSchema = new Schema<ICaregiverProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bio: { type: String, trim: true, maxlength: 500 },
    specialties: [{ type: Schema.Types.ObjectId, ref: 'ServiceCategory' }],
    skills: [{ type: String, trim: true }],
    experience: { type: Number, min: 0 },
    hourlyRate: { type: Number, min: 0 },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'US' },
    languages: [{ type: String, trim: true }],
    preferredPayoutMethod: { type: String, default: null },
    verificationAmount: { type: Number, default: 0 },
    verificationAmountPaid: { type: Boolean, default: false },
    verificationAmountPaidAt: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    verifiedBadge: { type: Boolean, default: false },
    isAvailableForBooking: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },

  },
  { timestamps: true }
);

caregiverProfileSchema.index({ verificationStatus: 1 });
caregiverProfileSchema.index({ isVerified: 1, isAvailableForBooking: 1 });
caregiverProfileSchema.index({ city: 1 });
caregiverProfileSchema.index({ hourlyRate: 1 });
caregiverProfileSchema.index({ averageRating: -1 });
caregiverProfileSchema.index({ specialties: 1 });

export const CaregiverProfile = model<ICaregiverProfile>(
  'CaregiverProfile',
  caregiverProfileSchema
);