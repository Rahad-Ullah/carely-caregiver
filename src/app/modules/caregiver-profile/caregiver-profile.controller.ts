import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { CaregiverProfileService } from './caregiver-profile.service';

const setupProfile = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.setupProfile(req.body, req.user!.id);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Caregiver profile created successfully',
    data: result,
  });
});

const getOwnProfile = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.getOwnProfile(req.user!.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Profile retrieved successfully',
    data: result,
  });
});

const updateOwnProfile = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.updateOwnProfile(req.user!.id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

const searchCaregivers = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.searchCaregivers(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Caregivers retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getCaregiverById = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.getCaregiverById(req.params.id as string, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Caregiver profile retrieved successfully',
    data: result,
  });
});

const adminGetAllCaregivers = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.adminGetAllCaregivers(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Caregivers retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const adminVerifyCaregiver = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.adminVerifyCaregiver(
    req.params.id as string,
    req.body
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: `Caregiver ${result?.verificationStatus} successfully`,
    data: result,
  });
});

const adminToggleBadge = catchAsync(async (req, res) => {
  const result = await CaregiverProfileService.adminToggleBadge(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: `Verified badge ${result?.verifiedBadge ? 'assigned' : 'removed'} successfully`,
    data: result,
  });
});

export const CaregiverProfileController = {
  setupProfile,
  getOwnProfile,
  updateOwnProfile,
  searchCaregivers,
  getCaregiverById,
  adminGetAllCaregivers,
  adminVerifyCaregiver,
  adminToggleBadge,
};