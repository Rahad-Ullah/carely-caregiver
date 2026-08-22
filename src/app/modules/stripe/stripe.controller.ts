import { Request, Response } from 'express';
import httpStatus from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StripeService } from './stripe.service';

const createCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const result = await StripeService.createCheckoutSession(req.body.bookingId, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Checkout session created successfully',
    data: result,
  });
});

const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const result = await StripeService.handleWebhook(req.body as Buffer, signature);
    res.status(httpStatus.OK).json(result);
  } catch (error: any) {
    console.error('[StripeWebhook] Error:', error.message);
    res.status(httpStatus.BAD_REQUEST).json({ success: false, message: error.message });
  }
};

const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await StripeService.getPaymentStatus(
    req.params.bookingId as string,
    req.user.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment status retrieved successfully',
    data: result,
  });
});

export const StripeController = {
  createCheckoutSession,
  handleWebhook,
  getPaymentStatus,
};