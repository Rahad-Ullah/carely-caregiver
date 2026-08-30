import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import ApiError from '../../../errors/ApiErrors';
import { VERIFICATION_STATUS } from '../../../enums/user';
import { QueryBuilder } from '../../buillder/queryBuilder';
import { User } from '../user/user.model';
import { CaregiverProfile } from './caregiver-profile.model';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import {
  IAdminVerifyPayload,
  ISetupProfilePayload,
  IUpdateProfilePayload,
} from './caregiver-profile.validation';
import { AvailabilityService } from '../availability/availability.service';

const USER_FIELDS = 'name email profileImage';
const SPECIALTY_FIELDS = 'name icon';

const toObjectIds = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));

const setupProfile = async (payload: ISetupProfilePayload, userId: string) => {
  const existing = await CaregiverProfile.findOne({ user: new Types.ObjectId(userId) });

  if (existing) {
    throw new ApiError(StatusCodes.CONFLICT, 'Caregiver profile already exists');
  }

  const data: Record<string, unknown> = {
    ...payload,
    user: new Types.ObjectId(userId),
    verificationStatus: VERIFICATION_STATUS.PENDING,
  };

  if (payload.specialties?.length) {
    data.specialties = toObjectIds(payload.specialties);
  }

  const [profile] = await Promise.all([
    CaregiverProfile.create(data),
    User.findByIdAndUpdate(userId, { intakeCompleted: true })
  ])

  return profile;
};

const getOwnProfile = async (userId: string) => {
  const profile = await CaregiverProfile.findOne({ user: new Types.ObjectId(userId) })
    .populate('user', USER_FIELDS)
    .populate('specialties', SPECIALTY_FIELDS);

  if (!profile) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'Caregiver profile not found. Please complete your profile setup.'
    );
  }

  return profile;
};

const updateOwnProfile = async (userId: string, payload: IUpdateProfilePayload) => {
  const updateData: Record<string, unknown> = { ...payload };

  if (payload.specialties?.length) {
    updateData.specialties = toObjectIds(payload.specialties);
  }

  return await CaregiverProfile.findOneAndUpdate(
    { user: new Types.ObjectId(userId) },
    updateData,
    { upsert: true, new: true, runValidators: true }
  )
    .populate('user', USER_FIELDS)
    .populate('specialties', SPECIALTY_FIELDS);
};

const searchCaregivers = async (query: Record<string, unknown>) => {
  const {
    searchTerm,
    specialty,
    skills,
    minRate,
    maxRate,
    minRating,
    language,
    page = 1,
    limit = 10,
    sortBy = 'averageRating',
    sortOrder = 'desc',
  } = query;

  const filter: Record<string, unknown> = {
    isVerified: true,
    isAvailableForBooking: true,
  };

  if (specialty) {
    filter.specialties = new Types.ObjectId(specialty as string);
  }

  if (skills) {
    const skillList = (skills as string).split(',').map((s) => s.trim());
    filter.skills = { $in: skillList };
  }

  if (minRate || maxRate) {
    const rateFilter: Record<string, number> = {};
    if (minRate) rateFilter.$gte = Number(minRate);
    if (maxRate) rateFilter.$lte = Number(maxRate);
    filter.hourlyRate = rateFilter;
  }

  if (minRating) {
    filter.averageRating = { $gte: Number(minRating) };
  }

  if (language) {
    filter.languages = { $in: [language] };
  }

  if (searchTerm) {
    const matchedUsers = await User.find({
      name: { $regex: searchTerm as string, $options: 'i' },
    }).select('_id');

    const matchedUserIds = matchedUsers.map((u) => u._id);

    filter.$or = [
      { user: { $in: matchedUserIds } },
      { city: { $regex: searchTerm as string, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [data, total] = await Promise.all([
    CaregiverProfile.find(filter)
      .populate('user', 'name profileImage')
      .populate('specialties', 'name')
      .sort({ [sortBy as string]: sortDir })
      .skip(skip)
      .limit(Number(limit))
      .select('bio hourlyRate averageRating'),
    CaregiverProfile.countDocuments(filter),
  ]);

  return {
    data,
    meta: { page: Number(page), limit: Number(limit), total },
  };
};

const getCaregiverById = async (id: string, query: { startDate?: string; endDate?: string }) => {
  const startDate = (query.startDate ? new Date(query.startDate) : new Date()).toISOString().split('T')[0];
  const endDate = (query.endDate ? new Date(query.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

  const [profile, availability] = await Promise.all([
    CaregiverProfile.findOne({ user: new Types.ObjectId(id) })
      .populate('user', 'name profileImage')
      .populate('specialties', 'name icon')
      .select('bio skills experience hourlyRate city state verifiedBadge averageRating totalReviews'),
    AvailabilityService.getCaregiverAvailability(id, { startDate, endDate })
  ])

  if (!profile) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Caregiver not found');
  }

  return { ...profile.toObject(), availability };
};

const adminGetAllCaregivers = async (query: Record<string, unknown>) => {
  // pre-filter user
  const filter: Record<string, unknown> = {};
  if (query.searchTerm) {
    const matchedUsers = await User.find({
      name: { $regex: query.searchTerm as string, $options: 'i' },
    }).select('_id');

    const matchedUserIds = matchedUsers.map((u) => u._id);

    filter.user = { $in: matchedUserIds };
  }

  const caregiverQuery = new QueryBuilder(
    CaregiverProfile.find(filter)
      .populate('user', 'name profileImage').lean(),

    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();



  const data = await caregiverQuery.modelQuery;

  const meta = await caregiverQuery.countTotal();

  const formattedData: any[] = data.map((profile: any) => ({
    _id: profile._id,
    user: profile.user,
    appliedOn: profile.createdAt,
  }));

  return {
    meta,
    data: formattedData
  };
};

const adminVerifyCaregiver = async (id: string, payload: IAdminVerifyPayload) => {
  const profile = await CaregiverProfile.findById(id);

  if (!profile) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Caregiver profile not found');
  }

  const isApproved = payload.status === VERIFICATION_STATUS.VERIFIED;

  const [updatedProfile] = await Promise.all([
    CaregiverProfile.findByIdAndUpdate(id, {
      verificationStatus: payload.status,
      isVerified: isApproved,
      isAvailableForBooking: isApproved,
      ...(!isApproved && { verifiedBadge: false }),

    }, { new: true }).populate('user', USER_FIELDS),
    User.findByIdAndUpdate(profile.user, {
      verificationStatus: payload.status
    })
  ])

  if (isApproved) {
    emailHelper.sendEmail(emailTemplate.caregiverApproved({
      name: (updatedProfile!.user as any).name,
      email: (updatedProfile!.user as any).email
    }));
  } else if (payload.status === VERIFICATION_STATUS.REJECTED) {
    emailHelper.sendEmail(emailTemplate.caregiverRejected({
      name: (updatedProfile!.user as any).name,
      email: (updatedProfile!.user as any).email,
      reason: (payload as any).reason
    }));
  }

  return updatedProfile
};

const adminToggleBadge = async (id: string) => {
  const profile = await CaregiverProfile.findById(id);

  if (!profile) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Caregiver profile not found');
  }

  if (!profile.isVerified) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Cannot assign badge to an unverified caregiver'
    );
  }

  return await CaregiverProfile.findByIdAndUpdate(
    id,
    { verifiedBadge: !profile.verifiedBadge },
    { new: true }
  ).populate('user', USER_FIELDS);
};

export const CaregiverProfileService = {
  setupProfile,
  getOwnProfile,
  updateOwnProfile,
  searchCaregivers,
  getCaregiverById,
  adminGetAllCaregivers,
  adminVerifyCaregiver,
  adminToggleBadge,
};