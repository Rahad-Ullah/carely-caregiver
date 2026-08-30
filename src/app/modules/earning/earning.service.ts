import { Types } from 'mongoose';
import httpStatus from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import ApiError from '../../../errors/ApiErrors';
import Earning from './earning.model';
import { CaregiverProfile } from '../caregiver-profile/caregiver-profile.model';
import { EARNING_STATUS } from './earning.interface';
import { QueryBuilder } from '../../buillder/queryBuilder';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import { User } from '../user/user.model';

const getWeekBounds = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday),
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { weekStart, weekEnd };
};

const getMyEarnings = async (
  caregiverUser: JwtPayload,
  query: Record<string, unknown>,
) => {
  // Returns paginated earnings list for the authenticated caregiver with booking and client details
  const baseQuery = Earning.find({
    caregiver: new Types.ObjectId(caregiverUser.id),
  }).populate({
    path: 'booking',
    select: 'date slotStartTime slotEndTime shift status',
    populate: [
      { path: 'serviceCategory', select: 'name' },
      { path: 'client', select: 'name profileImage' },
    ],
  });

  const builder = new QueryBuilder(baseQuery, query)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery;
  const meta = await builder.countTotal();
  return { meta, data };
};

const getMySummary = async (caregiverUser: JwtPayload) => {
  // Returns weekly total, 7-day bar chart breakdown, pending total, paid total and saved payout method
  const caregiverId = new Types.ObjectId(caregiverUser.id);
  const { weekStart, weekEnd } = getWeekBounds();
  const [weeklyAgg, statusAgg, profile] = await Promise.all([
    Earning.aggregate([
      {
        $match: {
          caregiver: caregiverId,
          createdAt: { $gte: weekStart, $lte: weekEnd },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Earning.aggregate([
      { $match: { caregiver: caregiverId } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
        },
      },
    ]),
    CaregiverProfile.findOne({ user: caregiverId })
      .select('preferredPayoutMethod')
      .lean<{ preferredPayoutMethod: string | null }>(),  // ← fix
  ]);

  // $dayOfWeek returns 1=Sun ... 7=Sat, remap to Mon=0 ... Sun=6
  const dayMap: Record<number, number> = {};
  weeklyAgg.forEach((d) => {
    const idx = d._id === 1 ? 6 : d._id - 2;
    dayMap[idx] = d.total;
  });

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyBreakdown = DAY_LABELS.map((day, i) => ({
    day,
    amount: dayMap[i] || 0,
  }));

  const weeklyTotal = weeklyBreakdown.reduce((sum, d) => sum + d.amount, 0);

  let pendingTotal = 0;
  let paidTotal = 0;
  statusAgg.forEach((t) => {
    if (t._id === EARNING_STATUS.PENDING) pendingTotal = t.total;
    if (t._id === EARNING_STATUS.PAID) paidTotal = t.total;
  });

  return {
    weeklyTotal,
    weeklyBreakdown,
    pendingTotal,
    paidTotal,
    payoutMethod: profile?.preferredPayoutMethod || null,
  };
};

const setPayoutMethod = async (caregiverUser: JwtPayload, payoutMethod: string) => {
  const profile = await CaregiverProfile.findOneAndUpdate(
    { user: new Types.ObjectId(caregiverUser.id) },
    { preferredPayoutMethod: payoutMethod },
    { new: true },
  )
    .select('preferredPayoutMethod')
    .lean<{ preferredPayoutMethod: string | null }>();

  if (!profile) throw new ApiError(httpStatus.NOT_FOUND, 'Caregiver profile not found');
  return { payoutMethod: profile.preferredPayoutMethod };
};

const getAllEarningsAdmin = async (query: Record<string, unknown>) => {
  // Admin retrieves all earnings with filter, sort, and pagination
  const filter: Record<string, unknown> = {};

  if (query.searchTerm) {
    const matchedUsers = await User.find({
      name: { $regex: query.searchTerm as string, $options: 'i' },
    }).select('_id');

    const matchedUserIds = matchedUsers.map((u) => u._id);

    filter.user = { $in: matchedUserIds };
  }

  const baseQuery = Earning.find(filter)
    .populate('caregiver', 'name email profileImage')
    .populate({
      path: 'booking',
      select: 'date slotStartTime slotEndTime status',
      populate: { path: 'serviceCategory', select: 'name' },
    });

  const builder = new QueryBuilder(baseQuery, query)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery;
  const meta = await builder.countTotal();
  return { meta, data };
};

const releaseEarning = async (
  earningId: string,
  payoutReference: string,
  payoutMethod?: string,
) => {
  // Admin releases a PENDING earning to PAID and records payout reference
  const earning = await Earning.findById(earningId).populate('caregiver', 'name email').populate({
    path: 'booking',
    populate: { path: 'client', select: 'name' }
  });
  if (!earning) throw new ApiError(httpStatus.NOT_FOUND, 'Earning not found');
  if (earning.status === EARNING_STATUS.PAID) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Earning has already been paid out');
  }

  earning.status = EARNING_STATUS.PAID;
  earning.paidAt = new Date();
  earning.payoutReference = payoutReference;
  if (payoutMethod) earning.payoutMethod = payoutMethod;
  await earning.save();

  emailHelper.sendEmail(emailTemplate.paymentReleased({
    name: (earning.caregiver as any).name,
    email: (earning.caregiver as any).email,
    bookingId: (earning.booking as any)._id.toString(),
    clientName: ((earning.booking as any).client as any).name,
    bookingDate: new Date((earning.booking as any).date).toDateString(),
    amount: earning.amount
  }));

  return earning;
};

export const EarningService = {
  getMyEarnings,
  getMySummary,
  setPayoutMethod,
  getAllEarningsAdmin,
  releaseEarning,
};