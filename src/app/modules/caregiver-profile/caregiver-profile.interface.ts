import { Document, Types } from 'mongoose';
import { VERIFICATION_STATUS } from '../../../enums/user';

export interface ICaregiverProfile extends Document {
  user: Types.ObjectId;
  bio: string;
  specialties: Types.ObjectId[];
  skills: string[];
  experience: number;
  hourlyRate: number;
  city: string;
  state: string;
  country: string;
  languages: string[];
  verificationAmount: number;
  verificationAmountPaid: boolean;
  verificationAmountPaidAt: Date | null;
  verificationStatus: VERIFICATION_STATUS;
  isVerified: boolean;
  verifiedBadge: boolean;
  isAvailableForBooking: boolean;
  averageRating: number;
  totalReviews: number;
  totalBookings: number;
  preferredPayoutMethod: string | null;
}