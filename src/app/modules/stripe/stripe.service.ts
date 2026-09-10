import { User } from '../user/user.model';
import Stripe from 'stripe';
import httpStatus from 'http-status-codes';
import ApiError from '../../../errors/ApiErrors';
import stripe from '../../../config/stripe.config';
import Booking from '../booking/booking.model';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../booking/booking.interface';
import { emitBookingEvent } from '../../../socket/socketHandlers';
import config from '../../../config';
import { CaregiverProfile } from '../caregiver-profile/caregiver-profile.model';

// checkout for booking payment
const createCheckoutSessionForBooking = async (bookingId: string, clientId: string) => {
  // Creates a Stripe Checkout Session for the booking total and attaches the Session ID to the booking
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  if (booking.client.toString() !== clientId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized');
  }
  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking already paid');
  }
  if (booking.heldUntil < new Date()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking hold has expired');
  }

  const client = await User.findById(clientId).select('email name');

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Booking Payment',
            description: `Payment for booking ID: ${booking._id.toString()}`,
          },
          unit_amount: Math.round(booking.totalAmount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: config.stripe.success_url || `${config.client_url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: config.stripe.cancel_url || `${config.client_url}/payment/cancel`,
    customer_email: client?.email || undefined,
    metadata: {
      paymentFor: 'booking',
      bookingId: booking._id.toString(),
      clientId,
    },
  });

  booking.paymentIntentId = session.id;
  await booking.save();

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    amount: booking.totalAmount,
  };
};

// checkout for verification payment
const createCheckoutSessionForVerification = async (userId: string, caregiverId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Verification Payment',
            description: `Payment for verification ID: ${user._id.toString()}`,
          },
          unit_amount: Math.round(10 * 100),  // TODO: dynamic amount, for now static 10$
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: config.stripe.success_url || `${config.client_url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: config.stripe.cancel_url || `${config.client_url}/payment/cancel`,
    customer_email: user.email,
    metadata: {
      paymentFor: 'verification',
      userId: user._id.toString(),
      caregiverId,
    },
    payment_intent_data: {
      setup_future_usage: 'off_session', // Optional: allows for one-click reordering
    },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  };
};

const handleWebhook = async (rawBody: Buffer, signature: string) => {
  // Verifies Stripe signature and processes payment lifecycle events
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!webhookSecret) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Webhook secret not configured');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Webhook signature failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentFor = session.metadata?.paymentFor;
      const amountPaid = (session.amount_total ?? 0) / 100;

      if (paymentFor === 'booking') {
        const bookingId = session.metadata?.bookingId;
        if (!bookingId) break;

        const booking = await Booking.findById(bookingId);
        if (!booking) break;

        booking.paymentStatus = PAYMENT_STATUS.PAID;
        if (session.payment_intent) {
          booking.paymentIntentId = session.payment_intent as string;
        }
        await booking.save();

        emitBookingEvent('booking:update', [booking.client.toString()], {
          bookingId: booking._id.toString(),
          status: booking.status as BOOKING_STATUS,
          paymentStatus: PAYMENT_STATUS.PAID,
          message: 'Payment received. Awaiting caregiver confirmation.',
          updatedAt: new Date().toISOString(),
        });
        break;
      };

      if (paymentFor === 'verification') {
        const userId = session.metadata?.userId;
        if (!userId) break;

        const caregiver = await CaregiverProfile.findOne({ user: userId });
        if (!caregiver) break;

        caregiver.verificationAmount = amountPaid;
        caregiver.verificationAmountPaid = true;
        caregiver.verificationAmountPaidAt = new Date();
        await caregiver.save();
        break;
      };
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      const booking = await Booking.findOne({
        $or: [
          { paymentIntentId: pi.id },
          { _id: bookingId }
        ]
      });
      if (!booking) break;

      if (booking.paymentStatus !== PAYMENT_STATUS.PAID) {
        booking.paymentStatus = PAYMENT_STATUS.PAID;
        booking.paymentIntentId = pi.id;
        await booking.save();

        emitBookingEvent('booking:update', [booking.client.toString()], {
          bookingId: booking._id.toString(),
          status: booking.status as BOOKING_STATUS,
          paymentStatus: PAYMENT_STATUS.PAID,
          message: 'Payment received. Awaiting caregiver confirmation.',
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      const booking = await Booking.findOne({
        $or: [
          { paymentIntentId: pi.id },
          { _id: bookingId }
        ]
      });
      if (!booking) break;

      emitBookingEvent('booking:update', [booking.client.toString()], {
        bookingId: booking._id.toString(),
        status: booking.status as BOOKING_STATUS,
        message: 'Payment failed. Please try again.',
        updatedAt: new Date().toISOString(),
      });
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const bookingId = charge.metadata?.bookingId;
      const booking = await Booking.findOne({
        $or: [
          { paymentIntentId: charge.payment_intent as string },
          { _id: bookingId }
        ]
      });
      if (!booking) break;

      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
      await booking.save();
      break;
    }

    default:
      console.log(`WEBHOOK: Unhandled event type: ${event.type}`);
  }

  return { received: true };
};

const getPaymentStatus = async (bookingId: string, userId: string) => {
  // Returns the paymentStatus for a booking; accessible by the booking's client or caregiver
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  if (booking.client.toString() !== userId && booking.caregiver.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized');
  }
  return { paymentStatus: booking.paymentStatus };
};

export const StripeService = { createCheckoutSessionForBooking, createCheckoutSessionForVerification, handleWebhook, getPaymentStatus };