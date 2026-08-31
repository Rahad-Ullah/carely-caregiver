import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AuthService } from "./auth.service";
import config from "../../../config";
import { setAuthCookie } from "../../../utils/setCookie";

//  Register
const registerUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerToDB(req.body);

  sendResponse(res, {
    success: true,
    message: "Registration successful. Please check your email for the OTP.",
    statusCode: StatusCodes.CREATED,
    data: result,
  });
});

// Login
const loginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.logintoDB(req.body);

  setAuthCookie(res, { refreshToken: result.refreshToken });

  sendResponse(res, {
    success: true,
    message: "Login successful",
    statusCode: StatusCodes.OK,
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    },
  });
});

// Refresh Token
const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.refreshToken(req.body);

  sendResponse(res, {
    success: true,
    message: "Token refreshed successfully",
    statusCode: StatusCodes.OK,
    data: result,
  });
});

// Logout
const logout = catchAsync(async (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: config.node_env === "production",
    sameSite: "lax",
  });

  sendResponse(res, {
    success: true,
    message: "Logout successful",
    statusCode: StatusCodes.OK,
    data: null,
  });
});

//Send OTP
const sendOtp = catchAsync(async (req: Request, res: Response) => {
  await AuthService.sendOtp(req.body);

  sendResponse(res, {
    success: true,
    message: "OTP sent successfully. It expires in 3 minutes.",
    statusCode: StatusCodes.OK,
    data: null,
  });
});

// Verify Email (OTP) — Returns tokens
const userVerify = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.userVerify(req.body);

  // Set refresh token in httpOnly cookie (same as login)
  setAuthCookie(res, { refreshToken: result!.refreshToken });

  sendResponse(res, {
    success: true,
    message: "Email verified successfully",
    statusCode: StatusCodes.OK,
    data: result
  });
});

//  Reset Password
const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body, req.user);

  sendResponse(res, {
    success: true,
    message: "Password reset successfully. Please log in.",
    statusCode: StatusCodes.OK,
    data: null,
  });
});

// Change password (authenticated user)
const changePassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.changePassword(req.body, req.user);

  // Clear the refresh token cookie on password change
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: config.node_env === "production",
    sameSite: "lax",
  });

  sendResponse(res, {
    success: true,
    message: "Password changed successfully. Please log in again.",
    statusCode: StatusCodes.OK,
    data: null,
  });
});


export const AuthController = {
  registerUser,
  loginUser,
  refreshToken,
  logout,
  sendOtp,
  userVerify,
  resetPassword,
  changePassword,
};
