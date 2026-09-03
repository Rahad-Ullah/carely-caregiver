export interface ISendEmail {
  to: string;
  subject: string;
  html: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export type ICreateAccountTemplate = {
  name: string;
  email: string;
  otp: number;
};

export type IResetPasswordTemplate = {
  email: string;
  otp: number;
};

// ── Booking shared base ───────────────────────────────────────────────────────
export type IBookingBaseTemplate = {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  caregiverName: string;
  caregiverEmail: string;
  serviceType: string;
  bookingDate: string; // UTC date string e.g. "Mon Apr 07 2026"
  shift: string; // "Morning" | "Afternoon" | "Evening" | "Night"
  careRecipientName: string;
  baseRate: number; // Caregiver base rate (before platform fee)
  totalAmount: number; // Amount charged to client (base + platform fee)
};

// ── 3. Booking Request → Caregiver ───────────────────────────────────────────
export type IBookingRequestTemplate = IBookingBaseTemplate & {
  specialInstructions?: string;
};

// ── 4. Booking Confirmed → Both ───────────────────────────────────────────────
export type IBookingConfirmedTemplate = IBookingBaseTemplate;

// ── 5. Booking Declined → Client ──────────────────────────────────────────────
export type IBookingDeclinedTemplate = IBookingBaseTemplate & {
  declineReason?: string;
};

// 5b. Booking Cancelled → Caregiver
export type IBookingCancelledTemplate = IBookingBaseTemplate & {
  cancelReason?: string;
};

// ── 6. Booking Auto-Released → Client ────────────────────────────────────────
export type IBookingAutoReleasedTemplate = IBookingBaseTemplate;

// ── 7. Booking Completed → Both ───────────────────────────────────────────────
export type IBookingCompletedTemplate = IBookingBaseTemplate;

// ── 8. Caregiver Approved ─────────────────────────────────────────────────────
export type ICaregiverApprovedTemplate = {
  name: string;
  email: string;
};

// ── 9. Caregiver Rejected ─────────────────────────────────────────────────────
export type ICaregiverRejectedTemplate = {
  name: string;
  email: string;
  reason?: string;
};

// ── 10. Document Verified ─────────────────────────────────────────────────────
export type IDocumentVerifiedTemplate = {
  name: string;
  email: string;
  documentType: string;
};

// ── 11. Document Rejected ─────────────────────────────────────────────────────
export type IDocumentRejectedTemplate = {
  name: string;
  email: string;
  documentType: string;
  reason?: string;
};

// ── 12. Payment Released → Caregiver ─────────────────────────────────────────
export type IPaymentReleasedTemplate = {
  name: string;
  email: string;
  bookingId: string;
  clientName: string;
  bookingDate: string;
  amount: number;
};