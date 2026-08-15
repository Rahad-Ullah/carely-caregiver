import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";
import { Secret } from "jsonwebtoken";

import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelper } from "../../../helpers/jwtHelper";
import { User } from "../user/user.model";
import generateOTP from "../../../utils/generateOTP";
import { STATUS, USER_ROLES, VERIFICATION_STATUS } from "../../../enums/user";
import { emailTemplate } from "../../../shared/emailTemplate";
import { emailHelper } from "../../../helpers/emailHelper";

import type {
  RegisterPayload,
  LoginPayload,
  RefreshTokenPayload,
  SendOtpPayload,
  VerifyUserPayload,
  ResetPasswordWithOtpPayload,
} from "./auth.validation";

// OTP expires in 3 minutes
const OTP_EXPIRE_MINUTES = 3;

// Helper: build JWT token pair
const generateTokens = (payload: {
  id: unknown;
  email: string;
  role: string;
}) => {
  const accessToken = jwtHelper.createToken(
    payload,
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );
  const refreshToken = jwtHelper.createToken(
    payload,
    config.jwt.jwt_refresh_secret as Secret,
    config.jwt.jwt_refresh_expire_in as string,
  );
  return { accessToken, refreshToken };
};

// REGISTER

const registerToDB = async (payload: RegisterPayload) => {
  const { email, password, name, role, phone } = payload;

  const existingUser = await User.findOne({ email, isDeleted: false });
  if (existingUser) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "An account with this email already exists",
    );
  }

  //  Set verificationStatus based on role
  //    CLIENT  → VERIFIED immediately (no document review required)
  //    CAREGIVER → UNVERIFIED (admin reviews uploaded documents first)
  const verificationStatus =
    role === USER_ROLES.CLIENT
      ? VERIFICATION_STATUS.VERIFIED
      : VERIFICATION_STATUS.UNVERIFIED;

  const user = await User.create({
    name,
    email,
    password,
    role,
    phone: phone ?? null,
    status: STATUS.ACTIVE,
    verified: false,
    verificationStatus,
    intakeCompleted: false,
  });

  const otp = generateOTP();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "authentication.oneTimeCode": otp,
        "authentication.expiredAt": new Date(
          Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000,
        ),
        "authentication.isResetPassword": false,
      },
    },
  );

  const mail = emailTemplate.createAccount({ name, email, otp });
  await emailHelper.sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
  });

  // 6. Create skeleton profile for role
  //    ── Uncomment these lines once CaregiverProfile / ClientProfile modules are built ──
  // if (role === USER_ROLES.CAREGIVER) {
  //   const { CaregiverProfile } = await import('../caregiver-profile/caregiverProfile.model');
  //   await CaregiverProfile.create({ user: user._id });
  // }
  // if (role === USER_ROLES.CLIENT) {
  //   const { ClientProfile } = await import('../client-profile/clientProfile.model');
  //   await ClientProfile.create({ user: user._id });
  // }

  return {
    userId: user._id,
    email: user.email,
    role: user.role,
  };
};

// LOGIN

const logintoDB = async (payload: LoginPayload) => {
  const { email, password, fcmToken } = payload;

  const user = await User.findOne({ email, isDeleted: false }).select(
    "+password +fcmToken",
  );
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No account found with this email",
    );
  }

  if (!user.verified) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      "Please verify your email before logging in",
    );
  }

  if (user.isBlocked) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Your account has been suspended. Please contact support.",
    );
  }
  if (user.status === STATUS.INACTIVE) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Your account is inactive");
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Incorrect password");
  }

  //  Update lastLogin (UTC) and FCM token if provided
  const updateFields: Record<string, unknown> = { lastLogin: new Date() };
  if (fcmToken) updateFields.fcmToken = fcmToken;
  await User.updateOne({ _id: user._id }, { $set: updateFields });

  // Generate tokens
  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = generateTokens(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      verificationStatus: user.verificationStatus,
      intakeCompleted: user.intakeCompleted,
    },
  };
};

// REFRESH TOKEN
const refreshToken = async (payload: RefreshTokenPayload) => {
  const { refreshToken: token } = payload;

  if (!token) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Refresh token is required");
  }

  const newAccessToken = await (
    jwtHelper as any
  ).createNewAccessTokenWithRefeshToken(token);
  return { accessToken: newAccessToken };
};

// SEND OTP
// Used for: (a) resend email verification OTP   (b) forgot password OTP
const sendOtp = async ({ email, isResetPassword = false }: SendOtpPayload) => {
  const user = await User.findOne({ email, isDeleted: false });
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No account found with this email",
    );
  }

  // For reset password — user must already be verified
  if (isResetPassword && !user.verified) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Please verify your email first",
    );
  }

  // Don't resend verification OTP if already verified
  if (!isResetPassword && user.verified) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Email is already verified");
  }

  const otp = generateOTP();
  const expiredAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "authentication.oneTimeCode": otp,
        "authentication.expiredAt": expiredAt,
        "authentication.isResetPassword": isResetPassword,
      },
    },
  );

  const mail = isResetPassword
    ? emailTemplate.resetPassword({ email, otp })
    : emailTemplate.createAccount({ name: user.name, email, otp });

  await emailHelper.sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
  });

  return null;
};

// VERIFY EMAIL (OTP check → return tokens)

const userVerify = async (payload: VerifyUserPayload) => {
  const { email, otp } = payload;

  const user = await User.findOne({ email, isDeleted: false }).select(
    "+authentication",
  );
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No account found with this email",
    );
  }

  if (user.verified) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Email is already verified");
  }

  const savedOtp = user.authentication?.oneTimeCode;
  const expiredAt = user.authentication?.expiredAt;

  if (!savedOtp || !expiredAt) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No OTP found. Please request a new one.",
    );
  }

  if (new Date(expiredAt).getTime() < Date.now()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "OTP has expired. Please request a new one.",
    );
  }

  if (String(savedOtp) !== String(otp)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Incorrect OTP");
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: { verified: true },
      $unset: {
        "authentication.oneTimeCode": 1,
        "authentication.expiredAt": 1,
        "authentication.isResetPassword": 1,
      },
    },
  );

  // Return tokens — frontend routes based on role + intakeCompleted
  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = generateTokens(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      verificationStatus: user.verificationStatus,
      intakeCompleted: user.intakeCompleted,
    },
  };
};

// RESET PASSWORD (OTP-based)
const resetPasswordWithOtp = async (payload: ResetPasswordWithOtpPayload) => {
  const { email, otp, password } = payload;

  const user = await User.findOne({ email, isDeleted: false }).select(
    "+authentication +password",
  );
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "No account found with this email",
    );
  }

  const savedOtp = user.authentication?.oneTimeCode;
  const expiredAt = user.authentication?.expiredAt;
  const isResetPassword = user.authentication?.isResetPassword;

  if (!savedOtp || !expiredAt || !isResetPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No valid password reset OTP found. Please request a new one.",
    );
  }

  if (new Date(expiredAt).getTime() < Date.now()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "OTP has expired. Please request a new one.",
    );
  }

  if (String(savedOtp) !== String(otp)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Incorrect OTP");
  }

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  await User.updateOne(
    { _id: user._id },
    {
      $set: { password: hashedPassword },
      $unset: {
        "authentication.oneTimeCode": 1,
        "authentication.expiredAt": 1,
        "authentication.isResetPassword": 1,
      },
    },
  );

  return null;
};

export const AuthService = {
  registerToDB,
  logintoDB,
  refreshToken,
  sendOtp,
  userVerify,
  resetPasswordWithOtp,
};
