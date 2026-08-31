import { z } from "zod";
import { USER_ROLES } from "../../../enums/user";

// Register
const createRegisterZodSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Name is required" })
      .min(2, "Name must be at least 2 characters"),
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    password: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    role: z.enum([USER_ROLES.CLIENT, USER_ROLES.CAREGIVER], {
      message: "Role must be either CLIENT or CAREGIVER",
    }),
    phone: z.string().optional(),
  }),
});

// Login
const createLoginZodSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    password: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    fcmToken: z.string().optional(),
  }),
});

// Refresh Token
const createRefreshTokenZodSchema = z.object({
  body: z.object({
    refreshToken: z.string({ message: "Refresh token is required" }),
  }),
});

// Send OTP
const createSendOtpZodSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    isResetPassword: z.boolean().optional().default(false),
  }),
});

// Verify Email (OTP)
const createVerifyUserZodSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email is required" })
      .email("Invalid email address"),
    otp: z.union([z.string(), z.number()]),
  }),
});

// Reset Password (OTP-based)
const createResetPasswordWithOtpZodSchema = z.object({
  body: z.object({
    newPassword: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters"),
  }),
});

const createChangePasswordZodSchema = z.object({
  body: z.object({
    currentPassword: z
      .string({ message: "Current password is required" })
      .nonempty("Current password is required"),
    newPassword: z
      .string({ message: "New password is required" })
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z
      .string({ message: "Confirm password is required" })
      .min(8, "Confirm password must be at least 8 characters"),
  }),
});


export const AuthValidation = {
  createRegisterZodSchema,
  createLoginZodSchema,
  createRefreshTokenZodSchema,
  createSendOtpZodSchema,
  createVerifyUserZodSchema,
  createResetPasswordWithOtpZodSchema,
  createChangePasswordZodSchema,
};

// Payload types
export type RegisterPayload = z.infer<typeof createRegisterZodSchema>["body"];
export type LoginPayload = z.infer<typeof createLoginZodSchema>["body"];
export type RefreshTokenPayload = z.infer<
  typeof createRefreshTokenZodSchema
>["body"];
export type SendOtpPayload = z.infer<typeof createSendOtpZodSchema>["body"];
export type VerifyUserPayload = z.infer<
  typeof createVerifyUserZodSchema
>["body"];
export type ResetPasswordWithOtpPayload = z.infer<
  typeof createResetPasswordWithOtpZodSchema
>["body"];
export type ChangePasswordPayload = z.infer<
  typeof createChangePasswordZodSchema
>["body"];
