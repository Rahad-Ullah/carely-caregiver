import express from "express";
import { AuthController } from "./auth.controller";
import { GoogleAuthRoutes } from "./google-auth.route";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";
import { checkAuth } from "../../middlewares/checkAuth";
import { USER_ROLES } from "../../../enums/user";

const router = express.Router();

router.post(
  "/register",
  validateRequest(AuthValidation.createRegisterZodSchema),
  AuthController.registerUser,
);

router.post(
  "/login",
  validateRequest(AuthValidation.createLoginZodSchema),
  AuthController.loginUser,
);

router.post(
  "/refresh-token",
  validateRequest(AuthValidation.createRefreshTokenZodSchema),
  AuthController.refreshToken,
);

router.post(
  "/logout",
  checkAuth(USER_ROLES.CLIENT, USER_ROLES.CAREGIVER, USER_ROLES.ADMIN),
  AuthController.logout,
);

router.post(
  "/send-otp",
  validateRequest(AuthValidation.createSendOtpZodSchema),
  AuthController.sendOtp,
);

router.post(
  "/verify-email",
  validateRequest(AuthValidation.createVerifyUserZodSchema),
  AuthController.userVerify,
);

router.post(
  "/reset-password",
  checkAuth(USER_ROLES.CLIENT, USER_ROLES.CAREGIVER, USER_ROLES.ADMIN),
  validateRequest(AuthValidation.createResetPasswordWithOtpZodSchema),
  AuthController.resetPassword,
);

router.post(
  "/change-password",
  checkAuth(USER_ROLES.CLIENT, USER_ROLES.CAREGIVER, USER_ROLES.ADMIN),
  validateRequest(AuthValidation.createChangePasswordZodSchema),
  AuthController.changePassword,
);

router.use(GoogleAuthRoutes);

export const AuthRoutes = router;
