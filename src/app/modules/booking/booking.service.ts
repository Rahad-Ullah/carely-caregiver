import httpStatus from 'http-status-codes';
import mongoose, { Types } from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';

import ApiError from '../../../errors/ApiErrors';
import { sendNotification } from '../../../shared/sendNotification';
import { emitBookingEvent } from '../../../socket/socketHandlers';
import Booking from './booking.model';
import { Availability } from '../availability/availability.model';
import { CaregiverProfile } from '../caregiver-profile/caregiver-profile.model';
import CareRecipient from '../care-recipient/care-recipient.model';
import Earning from '../earning/earning.model';
import stripe from '../../../config/stripe.config';
import { QueryBuilder } from '../../buillder/queryBuilder';
import { NOTIFICATION_TYPE } from '../../../enums/notification';
import { BOOKING_STATUS, CANCELLED_BY, PAYMENT_STATUS, SHIFT_TYPE } from './booking.interface';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import { StripeService } from '../stripe/stripe.service';
import { EARNING_STATUS } from '../earning/earning.interface';
import { errorLogger } from '../../../shared/logger';

const SERVICE_FEE_RATE = 0.0893;
const HOLD_DURATION_MS = 30 * 60 * 1000;

const getUTCDayBounds = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return {
    startOfDay: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)),
    endOfDay: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
  };
};

const calcHours = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
};

const getEmailPayload = async (bookingId: string) => {
  const b = await Booking.findById(bookingId)
    .populate('client', 'name email')
    .populate('caregiver', 'name email')
    .populate('careRecipient', 'fullName')
    .populate('serviceCategory', 'name');

  return {
    bookingId: b!._id.toString(),
    clientName: (b!.client as any).name,
    clientEmail: (b!.client as any).email,
    caregiverName: (b!.caregiver as any).name,
    caregiverEmail: (b!.caregiver as any).email,
    serviceType: (b!.serviceCategory as any).name,
    bookingDate: b!.date.toDateString(),
    shift: b!.shift,
    careRecipientName: (b!.careRecipient as any).fullName,
    baseRate: b!.basePrice,
    totalAmount: b!.totalAmount,
  };
};

const notifyAndEmit = async (
  recipientId: string,
  title: string,
  body: string,
  type: NOTIFICATION_TYPE,
  bookingId: string,
  bookingStatus: BOOKING_STATUS,
) => {
  await sendNotification({ recipientId, type, title, body, referenceId: bookingId });
  emitBookingEvent('booking:update', [recipientId], {
    bookingId,
    status: bookingStatus,
    message: body,
    updatedAt: new Date().toISOString(),
  });
};

export const releaseAvailabilitySlot = async (
  caregiverId: string,
  date: Date,
  shift: string,
  slotStartTime: string,
) => {
  const { startOfDay, endOfDay } = getUTCDayBounds(date);

  const avail = await Availability.findOneAndUpdate(
    {
      caregiver: new Types.ObjectId(caregiverId),
      date: { $gte: startOfDay, $lte: endOfDay },
    },
    {
      $set: {
        'shifts.$[sh].slots.$[sl].status': 'AVAILABLE',
        'shifts.$[sh].slots.$[sl].heldUntil': null,
        'shifts.$[sh].slots.$[sl].bookingId': null,
      },
    },
    {
      arrayFilters: [{ 'sh.shiftType': shift }, { 'sl.startTime': slotStartTime }],
      new: true,
    },
  );

  if (avail) {
    const hasBookedSlot = avail.shifts.some((s: any) =>
      s.slots.some((sl: any) => sl.status === 'BOOKED'),
    );
    if (!hasBookedSlot) {
      avail.isDayBlocked = false;
      await avail.save();
    }
  }
};

const createBooking = async (
  payload: {
    caregiver: string;
    careRecipient: string;
    serviceCategory: string;
    date: string;
    shift: SHIFT_TYPE;
    slotStartTime: string;
    slotEndTime: string;
    instructions?: string;
  },
  clientUser: JwtPayload,
) => {
  // Validates caregiver availability, holds the slot atomically, notifies caregiver
  const {
    caregiver: caregiverId,
    careRecipient,
    serviceCategory,
    date,
    shift,
    slotStartTime,
    slotEndTime,
    instructions,
  } = payload;

  const recipient = await CareRecipient.findOne({
    _id: new Types.ObjectId(careRecipient),
    client: new Types.ObjectId(clientUser.id),
    isActive: true,
  });
  if (!recipient) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Care recipient not found or does not belong to you');
  }

  const caregiverProfile = await CaregiverProfile.findOne({
    user: new Types.ObjectId(caregiverId),
    isAvailableForBooking: true,
  }).select('hourlyRate');
  if (!caregiverProfile) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'Caregiver is not available for booking');
  }

  const hours = calcHours(slotStartTime, slotEndTime);
  if (hours <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid slot time range');
  }

  const basePrice = parseFloat((caregiverProfile.hourlyRate * hours).toFixed(2));
  const serviceFee = parseFloat((basePrice * SERVICE_FEE_RATE).toFixed(2));
  const totalAmount = parseFloat((basePrice + serviceFee).toFixed(2));
  const heldUntil = new Date(Date.now() + HOLD_DURATION_MS);
  const bookingDate = new Date(date);
  const { startOfDay, endOfDay } = getUTCDayBounds(bookingDate);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [booking] = await Booking.create(
      [
        {
          client: new Types.ObjectId(clientUser.id),
          caregiver: new Types.ObjectId(caregiverId),
          careRecipient: new Types.ObjectId(careRecipient),
          serviceCategory: new Types.ObjectId(serviceCategory),
          date: bookingDate,
          shift,
          slotStartTime,
          slotEndTime,
          instructions: instructions ?? null,
          status: BOOKING_STATUS.PENDING,
          heldUntil,
          basePrice,
          serviceFee,
          totalAmount,
          paymentStatus: PAYMENT_STATUS.UNPAID,
          paymentIntentId: null,
          declineReason: null,
          cancelledBy: null,
          cancelReason: null,
          completedAt: null,
        },
      ],
      { session },
    );

    const slotHeld = await Availability.findOneAndUpdate(
      {
        caregiver: new Types.ObjectId(caregiverId),
        date: { $gte: startOfDay, $lte: endOfDay },
        isDayBlocked: false,
        'shifts.shiftType': shift,
        'shifts.slots': { $elemMatch: { startTime: slotStartTime, status: 'AVAILABLE' } },
      },
      {
        $set: {
          'shifts.$[sh].slots.$[sl].status': 'HELD',
          'shifts.$[sh].slots.$[sl].heldUntil': heldUntil,
          'shifts.$[sh].slots.$[sl].bookingId': booking._id,
        },
      },
      {
        arrayFilters: [
          { 'sh.shiftType': shift },
          { 'sl.startTime': slotStartTime, 'sl.status': 'AVAILABLE' },
        ],
        session,
        new: true,
      },
    );

    if (!slotHeld) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Selected time slot is no longer available. Please choose another slot.',
      );
    }

    await session.commitTransaction();

    // create payment session
    const payment = await StripeService.createCheckoutSessionForBooking(
      booking._id.toString(),
      clientUser.id,
    );


    await notifyAndEmit(
      caregiverId,
      'New Booking Request',
      'You have a new booking request. Please respond within 30 minutes.',
      NOTIFICATION_TYPE.BOOKING_REQUEST,
      booking._id.toString(),
      BOOKING_STATUS.PENDING,
    );

    const payload = await getEmailPayload(booking._id.toString());
    emailHelper.sendEmail(emailTemplate.bookingRequest({ ...payload, specialInstructions: instructions ?? undefined }));

    return payment;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const getMyBookings = async (clientUser: JwtPayload, query: Record<string, unknown>) => {
  // Returns paginated bookings for the authenticated client
  const filter: Record<string, unknown> = {
    client: new Types.ObjectId(clientUser.id),
  }
  if (query.date) {
    const { startOfDay, endOfDay } = getUTCDayBounds(new Date(query.date as string));
    filter.date = {
      $gte: startOfDay,
      $lte: endOfDay,
    }
  }
  const baseQuery = Booking.find(filter)
    .populate('caregiver', 'name profileImage')
    .populate('serviceCategory', 'name')
    .populate('careRecipient', 'fullName');

  const builder = new QueryBuilder(baseQuery, query).filter().sort().paginate().fields();
  const data = await builder.modelQuery;
  const meta = await builder.countTotal();

  return { meta, data };
};

const getCaregiverBookings = async (caregiverUser: JwtPayload, query: Record<string, unknown>) => {
  // Returns paginated incoming bookings for the authenticated caregiver
  const filter: Record<string, unknown> = {
    caregiver: new Types.ObjectId(caregiverUser.id),
    paymentStatus: { $ne: PAYMENT_STATUS.UNPAID },
  };

  if (query.date) {
    const { startOfDay, endOfDay } = getUTCDayBounds(new Date(query.date as string));
    filter.date = {
      $gte: startOfDay,
      $lte: endOfDay,
    }
  }

  const baseQuery = Booking.find(filter)
    .populate('client', 'name profileImage')
    .populate('serviceCategory', 'name')
    .populate('careRecipient', 'fullName relationship');

  const builder = new QueryBuilder(baseQuery, query).filter().sort().paginate().fields();
  const data = await builder.modelQuery;
  const meta = await builder.countTotal();

  return { meta, data };
};

const getSingleBooking = async (bookingId: string, reqUser: JwtPayload) => {
  // Returns a single booking; only the booking's client and caregiver can access it
  const booking = await Booking.findById(new Types.ObjectId(bookingId))
    .populate('client', 'name profileImage')
    .populate('caregiver', 'name profileImage')
    .populate('serviceCategory', 'name')
    .populate('careRecipient', 'fullName relationship');

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  const isClient = (booking.client as any)._id.toString() === reqUser.id;
  const isCaregiver = (booking.caregiver as any)._id.toString() === reqUser.id;

  if (!isClient && !isCaregiver) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this booking');
  }

  return booking;
};

const acceptBooking = async (bookingId: string, caregiverUser: JwtPayload) => {
  // Confirms the booking, sets slot to BOOKED, blocks the availability day
  const booking = await Booking.findById(new Types.ObjectId(bookingId));
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  if (booking.caregiver.toString() !== caregiverUser.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to accept this booking');
  }

  if (booking.status !== BOOKING_STATUS.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot accept a booking with status: ${booking.status}`,
    );
  }

  if (new Date() > booking.heldUntil) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This booking hold has already expired');
  }

  if (booking.paymentStatus !== PAYMENT_STATUS.PAID) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot accept a booking that has not been paid');
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  await booking.save();

  const { startOfDay, endOfDay } = getUTCDayBounds(booking.date);

  await Availability.findOneAndUpdate(
    { caregiver: booking.caregiver, date: { $gte: startOfDay, $lte: endOfDay } },
    {
      isDayBlocked: true,
      $set: {
        'shifts.$[sh].slots.$[sl].status': 'BOOKED',
        'shifts.$[sh].slots.$[sl].heldUntil': null,
      },
    },
    {
      arrayFilters: [
        { 'sh.shiftType': booking.shift },
        { 'sl.startTime': booking.slotStartTime },
      ],
      new: true,
    },
  );

  await Promise.all([
    notifyAndEmit(
      booking.client.toString(),
      'Booking Confirmed',
      'Your booking request has been accepted by the caregiver.',
      NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      booking._id.toString(),
      BOOKING_STATUS.CONFIRMED,
    ),
    notifyAndEmit(
      booking.caregiver.toString(),
      'Booking Confirmed',
      'You have confirmed a booking.',
      NOTIFICATION_TYPE.BOOKING_CONFIRMED,
      booking._id.toString(),
      BOOKING_STATUS.CONFIRMED,
    ),
  ]);

  const payload = await getEmailPayload(booking._id.toString());
  emailHelper.sendEmail(emailTemplate.bookingConfirmedClient(payload)).catch((err) => {
    errorLogger.error(' Email send failed:', err);
  });
  emailHelper.sendEmail(emailTemplate.bookingConfirmedCaregiver(payload)).catch((err) => {
    errorLogger.error(' Email send failed:', err);
  });

  return booking;
};

const declineBooking = async (
  bookingId: string,
  caregiverUser: JwtPayload,
  declineReason: string,
) => {
  // Caregiver rejects a pending booking, releases the slot and refunds if already paid
  const booking = await Booking.findById(new Types.ObjectId(bookingId));
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  if (booking.caregiver.toString() !== caregiverUser.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to decline this booking');
  }

  if (booking.status !== BOOKING_STATUS.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot decline a booking with status: ${booking.status}`,
    );
  }

  booking.status = BOOKING_STATUS.DECLINED;
  booking.declineReason = declineReason;
  await booking.save();

  await releaseAvailabilitySlot(
    booking.caregiver.toString(),
    booking.date,
    booking.shift,
    booking.slotStartTime,
  );

  // full refund to client
  if (booking.paymentIntentId && booking.paymentStatus === PAYMENT_STATUS.PAID) {
    await stripe.refunds.create({ payment_intent: booking.paymentIntentId });
    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await booking.save();
  }

  await notifyAndEmit(
    booking.client.toString(),
    'Booking Declined',
    `Your booking request was declined. Reason: ${declineReason}`,
    NOTIFICATION_TYPE.BOOKING_DECLINED,
    booking._id.toString(),
    BOOKING_STATUS.DECLINED,
  );

  const payload = await getEmailPayload(booking._id.toString());
  emailHelper.sendEmail(emailTemplate.bookingDeclined({ ...payload, declineReason }));

  return booking;
};

const cancelBooking = async (
  bookingId: string,
  clientUser: JwtPayload,
  cancelReason?: string,
) => {
  // Client cancels a PENDING or CONFIRMED booking, releases the slot and refunds if paid
  const booking = await Booking.findById(new Types.ObjectId(bookingId));
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  if (booking.client.toString() !== clientUser.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to cancel this booking');
  }

  const cancellableStatuses: BOOKING_STATUS[] = [
    BOOKING_STATUS.PENDING,
    BOOKING_STATUS.CONFIRMED,
  ];
  if (!cancellableStatuses.includes(booking.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel a booking with status: ${booking.status}`,
    );
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledBy = CANCELLED_BY.CLIENT;
  booking.cancelReason = cancelReason ?? null;
  await booking.save();

  await releaseAvailabilitySlot(
    booking.caregiver.toString(),
    booking.date,
    booking.shift,
    booking.slotStartTime,
  );

  // partial refund to client (90% of the booking amount)
  if (booking.paymentIntentId && booking.paymentStatus === PAYMENT_STATUS.PAID) {
    await stripe.refunds.create({ payment_intent: booking.paymentIntentId, amount: Math.round(booking.basePrice * 0.9) });
    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await booking.save();
  }

  await notifyAndEmit(
    booking.caregiver.toString(),
    'Booking Cancelled',
    'The client has cancelled their booking.',
    NOTIFICATION_TYPE.BOOKING_CANCELLED,
    booking._id.toString(),
    BOOKING_STATUS.CANCELLED,
  );

  const payload = await getEmailPayload(booking._id.toString());
  emailHelper.sendEmail(emailTemplate.bookingCancelledClient({ ...payload, cancelReason })).catch((err) => {
    errorLogger.error(' Email send failed:', err);
  });

  return booking;
};

const completeBooking = async (bookingId: string, caregiverUser: JwtPayload) => {
  // Marks a confirmed booking as completed and creates the caregiver earning record
  const booking = await Booking.findById(new Types.ObjectId(bookingId));
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  if (booking.caregiver.toString() !== caregiverUser.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to complete this booking');
  }

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only confirmed bookings can be marked as completed');
  }

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.completedAt = new Date();
  await booking.save();

  await Earning.create({
    caregiver: booking.caregiver,
    booking: booking._id,
    amount: booking.basePrice,
    status: EARNING_STATUS.PENDING,
  });

  await notifyAndEmit(
    booking.client.toString(),
    'Care Session Completed',
    'Your care session is complete. Please leave a review.',
    NOTIFICATION_TYPE.BOOKING_COMPLETED,
    booking._id.toString(),
    BOOKING_STATUS.COMPLETED,
  );

  const payload = await getEmailPayload(booking._id.toString());
  emailHelper.sendEmail(emailTemplate.bookingCompletedClient(payload));
  emailHelper.sendEmail(emailTemplate.bookingCompletedCaregiver(payload));

  return booking;
};

const getAllBookingsAdmin = async (query: Record<string, unknown>) => {
  // Admin retrieves all bookings with filter, sort, and pagination support
  const baseQuery = Booking.find()
    .populate('client', 'name email')
    .populate('caregiver', 'name email')
    .populate('serviceCategory', 'name');

  const builder = new QueryBuilder(baseQuery, query).filter().sort().paginate().fields();
  const data = await builder.modelQuery;
  const meta = await builder.countTotal();

  return { meta, data };
};

const adminCancelBooking = async (bookingId: string) => {
  // Admin force-cancels any non-terminal booking and notifies both parties
  const booking = await Booking.findById(new Types.ObjectId(bookingId));
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');

  const terminalStatuses: BOOKING_STATUS[] = [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.AUTO_RELEASED,
  ];
  if (terminalStatuses.includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking is already in a terminal state');
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledBy = CANCELLED_BY.ADMIN;
  await booking.save();

  await releaseAvailabilitySlot(
    booking.caregiver.toString(),
    booking.date,
    booking.shift,
    booking.slotStartTime,
  );

  if (booking.paymentIntentId && booking.paymentStatus === PAYMENT_STATUS.PAID) {
    await stripe.refunds.create({ payment_intent: booking.paymentIntentId });
    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await booking.save();
  }

  await Promise.all([
    notifyAndEmit(
      booking.client.toString(),
      'Booking Cancelled by Admin',
      'Your booking has been cancelled by the platform administrator.',
      NOTIFICATION_TYPE.BOOKING_CANCELLED,
      booking._id.toString(),
      BOOKING_STATUS.CANCELLED,
    ),
    notifyAndEmit(
      booking.caregiver.toString(),
      'Booking Cancelled by Admin',
      'A booking assigned to you has been cancelled by the administrator.',
      NOTIFICATION_TYPE.BOOKING_CANCELLED,
      booking._id.toString(),
      BOOKING_STATUS.CANCELLED,
    ),
  ]);

  return booking;
};

export const autoReleaseExpiredBookings = async () => {
  // Called by cron every minute to auto-release expired PENDING bookings
  const expiredBookings = await Booking.find({
    status: BOOKING_STATUS.PENDING,
    heldUntil: { $lte: new Date() },
  });

  for (const booking of expiredBookings) {
    booking.status = BOOKING_STATUS.AUTO_RELEASED;
    await booking.save();

    await releaseAvailabilitySlot(
      booking.caregiver.toString(),
      booking.date,
      booking.shift,
      booking.slotStartTime,
    );

    if (booking.paymentIntentId && booking.paymentStatus === PAYMENT_STATUS.PAID) {
      await stripe.refunds.create({ payment_intent: booking.paymentIntentId });
      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
      await booking.save();
    }

    await notifyAndEmit(
      booking.client.toString(),
      'Booking Request Expired',
      'Your booking request expired as the caregiver did not respond within 30 minutes. The slot has been released.',
      NOTIFICATION_TYPE.BOOKING_AUTO_RELEASED,
      booking._id.toString(),
      BOOKING_STATUS.AUTO_RELEASED,
    );

    const payload = await getEmailPayload(booking._id.toString());
    emailHelper.sendEmail(emailTemplate.bookingAutoReleased(payload));
  }
};

export const BookingService = {
  createBooking,
  getMyBookings,
  getCaregiverBookings,
  getSingleBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  completeBooking,
  getAllBookingsAdmin,
  adminCancelBooking,
  autoReleaseExpiredBookings,
};