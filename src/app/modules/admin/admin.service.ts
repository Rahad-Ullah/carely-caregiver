import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import ApiError from '../../../errors/ApiErrors';
import { User } from '../user/user.model';
import Booking from '../booking/booking.model';
import { CaregiverDocument } from '../document/document.model';
import { QueryBuilder } from '../../buillder/queryBuilder'; 
import { emailHelper } from './../../../helpers/emailHelper';
import { USER_ROLES } from '../../../enums/user';
import { DOCUMENT_STATUS } from '../../../enums/document';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../booking/booking.interface';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getStats = async () => {
  // Aggregates platform KPIs: total users split by role, active bookings count, pending document approval count, and cumulative platform revenue from paid bookings
  const [totalClients, totalCaregivers, activeBookings, pendingApprovals, revenueAgg] =
    await Promise.all([
      User.countDocuments({ role: USER_ROLES.CLIENT, isDeleted: false }),
      User.countDocuments({ role: USER_ROLES.CAREGIVER, isDeleted: false }),
      Booking.countDocuments({
        status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
      }),
      CaregiverDocument.countDocuments({ status: DOCUMENT_STATUS.PENDING }),
      Booking.aggregate([
        { $match: { paymentStatus: PAYMENT_STATUS.PAID } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

  return {
    totalUsers: totalClients + totalCaregivers,
    totalClients,
    totalCaregivers,
    activeBookings,
    pendingApprovals,
    totalRevenue: revenueAgg.length
      ? parseFloat(revenueAgg[0].total.toFixed(2))
      : 0,
  };
};

const getRevenueChart = async (period: 'week' | 'month') => {
  // Groups paid booking totals by day for the last 7 days when period is week, or by month for the last 12 months when period is month
  const now = new Date();

  if (period === 'week') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const data = await Booking.aggregate([
      {
        $match: {
          paymentStatus: 'PAID',
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          revenue: { $sum: '$totalAmount' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    return data.map((item) => ({
      label: `${String(item._id.day).padStart(2, '0')} ${MONTH_LABELS[item._id.month - 1]}`,
      revenue: parseFloat(item.revenue.toFixed(2)),
      bookings: item.bookings,
    }));
  }

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const data = await Booking.aggregate([
    {
      $match: {
        paymentStatus: 'PAID',
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$totalAmount' },
        bookings: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return data.map((item) => ({
    label: MONTH_LABELS[item._id.month - 1],
    year: item._id.year,
    revenue: parseFloat(item.revenue.toFixed(2)),
    bookings: item.bookings,
  }));
};

const getAllUsers = async (query: Record<string, unknown>) => {
  // Returns all non-deleted users with pagination, supports filtering by role and status, and searching by name, email, or phone
  const baseQuery = User.find({ isDeleted: false }).select(
    'name email phone role profileImage isBlocked createdAt',
  );

  const builder = new QueryBuilder(baseQuery, query)
    .filter()
    .search(['name', 'email', 'phone'])
    .sort()
    .paginate();

  const [data, meta] = await Promise.all([
    builder.modelQuery,
    builder.countTotal(),
  ]);

  return { meta, data };
};

const blockUser = async (userId: string) => {
  // Toggles isBlocked on a user account, blocking prevents login and platform access while unblocking restores it
  const user = await User.findById(new Types.ObjectId(userId));
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  if (user.role === USER_ROLES.ADMIN) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Admin accounts cannot be blocked');
  }

  user.isBlocked = !user.isBlocked;
  await user.save();

  return {
    _id: user._id,
    isBlocked: user.isBlocked,
    message: user.isBlocked ? 'User has been blocked' : 'User has been unblocked',
  };
};

const softDeleteUser = async (userId: string) => {
  // Soft-deletes a user by setting isDeleted true, removing them from all platform listings and preventing login
  const user = await User.findById(new Types.ObjectId(userId));
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  if (user.role === USER_ROLES.ADMIN) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Admin accounts cannot be deleted');
  }
  if (user.isDeleted) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'User is already deleted');
  }

  user.isDeleted = true;
  await user.save();

  return { deleted: true };
};

const inviteCaregiver = async (payload: {
  name: string;
  email: string;
  specialization?: string;
  personalMessage?: string;
}) => {
  // Sends a personalised invitation email to a prospective caregiver with a pre-filled sign-up link
  const { name, email, specialization, personalMessage } = payload;
  const appUrl = process.env.CLIENT_URL ?? 'https://carely.app';
  const signUpLink = `${appUrl}/register?role=CAREGIVER&email=${encodeURIComponent(email)}`;

  const specializationLine = specialization
    ? ` specializing in <strong>${specialization}</strong>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;">You're Invited to Join Carely</h2>
      <p>Hi ${name},</p>
      <p>The Carely team has personally invited you to join our platform as a professional caregiver${specializationLine}.</p>
      ${personalMessage ? `<p style="background:#f5f5f5;padding:12px;border-radius:6px;">${personalMessage}</p>` : ''}
      <p>Click the button below to create your account and start accepting bookings:</p>
      <a href="${signUpLink}"
         style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
        Create My Account
      </a>
      <p style="font-size:12px;color:#999;margin-top:24px;">
        If you did not expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  await emailHelper.sendEmail({
    to: email,
    subject: 'You are invited to join Carely as a Caregiver',
    html,
  });

  return { invited: true, email };
};

export const AdminService = {
  getStats,
  getRevenueChart,
  getAllUsers,
  blockUser,
  softDeleteUser,
  inviteCaregiver,
};