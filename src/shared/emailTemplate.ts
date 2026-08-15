import {
  ICreateAccountTemplate,
  IResetPasswordTemplate,
  IBookingRequestTemplate,
  IBookingConfirmedTemplate,
  IBookingDeclinedTemplate,
  IBookingAutoReleasedTemplate,
  IBookingCompletedTemplate,
  ICaregiverApprovedTemplate,
  ICaregiverRejectedTemplate,
  IDocumentVerifiedTemplate,
  IDocumentRejectedTemplate,
  IPaymentReleasedTemplate,
  ISendEmail,
} from '../types/emailTemplate';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BRAND = '#1a7f8a';
const LIGHT = '#e8f5f6';
const SUCCESS = '#27ae60';
const DANGER = '#c0392b';
const WARN = '#e67e22';

// ─── Layout helpers ───────────────────────────────────────────────────────────
const FONT_STACK = "system-ui, -apple-system, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const wrap = (content: string) => `
  <div style="background-color: #f4f7f9; margin: 0; padding: 40px 16px; font-family: ${FONT_STACK}; color: #333333; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #eef2f5;">
      ${content}
    </div>
  </div>`;

const header = (title: string, sub?: string) => `
  <div style="background-color: ${BRAND}; padding: 32px 24px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">🩺 Carely</h1>
    <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0; font-size: 15px; font-weight: 500;">${title}</p>
    ${sub ? `<p style="color: rgba(255, 255, 255, 0.75); margin: 4px 0 0; font-size: 13px;">${sub}</p>` : ''}
  </div>`;

const row = (label: string, value: string) => `
  <tr style="border-bottom: 1px solid #f0f4f8;">
    <td style="padding: 10px 0; color: #777777; font-size: 13px; font-weight: 500; width: 40%; vertical-align: top;">${label}</td>
    <td style="padding: 10px 0; font-weight: 600; color: #111111; font-size: 14px; text-align: right; vertical-align: top;">${value}</td>
  </tr>`;

const box = (color: string, rows: string) => `
  <div style="background-color: #f8fafc; border-left: 4px solid ${color}; border-radius: 6px; padding: 14px 18px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
  </div>`;

const alert = (color: string, text: string) => `
  <div style="background-color: #fafbfc; border-left: 4px solid ${color}; border-radius: 6px; padding: 14px 18px; margin: 20px 0;">
    <p style="margin: 0; color: #444444; font-size: 14px; line-height: 1.5;">${text}</p>
  </div>`;

const footer = () => `
  <div style="background-color: #ffffff; border-top: 1px solid #eef2f5; padding: 24px; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #888888; font-weight: 500;">&copy; ${new Date().getFullYear()} Carely. All rights reserved.</p>
    <p style="margin: 6px 0 0; font-size: 12px; color: #aaaaaa;">Connecting clients with trusted caregivers.</p>
  </div>`;

// ─────────────────────────────────────────────────────────────────────────────
//  1. CREATE ACCOUNT (OTP verification)
// ─────────────────────────────────────────────────────────────────────────────
const createAccount = (v: ICreateAccountTemplate): ISendEmail => ({
  to: v.email,
  subject: 'Verify your Carely account',
  html: wrap(`
    ${header('Email Verification', 'Welcome to Carely')}
    <div style="background-color: #f4f7f9; padding: 40px 16px; font-family: system-ui, -apple-system, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333333;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px 32px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 600; color: #111111; text-align: center; letter-spacing: -0.3px;">
          Verify Your Email
        </h2>
        <p style="margin: 0 0 28px; font-size: 15px; color: #666666; text-align: center; line-height: 1.5;">
          Thank you for joining <strong>Carely</strong>. Use the verification code below to activate your account.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <div style="display: inline-block; background-color: #f0f8fc; border: 1px dashed ${BRAND}; border-radius: 10px; padding: 14px 28px;">
            <span style="font-family: ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: ${BRAND};">
              ${v.otp}
            </span>
          </div>
        </div>
        <p style="margin: 0 0 32px; font-size: 13px; color: #888888; text-align: center;">
          This code will expire in <strong style="color: #555555;">3 minutes</strong>.
        </p>
        <hr style="border: none; border-top: 1px solid #eef2f5; margin: 32px 0 24px;" />
        <p style="margin: 0; font-size: 12px; color: #999999; text-align: center; line-height: 1.4;">
          If you did not create a Carely account, you can safely ignore this email.
        </p>
      </div>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. RESET PASSWORD (OTP)
// ─────────────────────────────────────────────────────────────────────────────
const resetPassword = (v: IResetPasswordTemplate): ISendEmail => ({
  to: v.email,
  subject: 'Carely — Password Reset Code',
  html: wrap(`
    ${header('Password Reset')}
    <div style="background:white;padding:32px 28px;text-align:center;">
      <p style="color:#555;font-size:15px;line-height:1.7;margin-bottom:8px;">
        We received a request to reset your password. Use the code below:
      </p>
      <div style="background:#f8fdfd;padding:18px 25px;border:2px solid ${BRAND};border-radius:10px;color:${BRAND};font-size:32px;font-weight:800;letter-spacing:8px;width:160px;margin:24px auto;">${v.otp}</div>
      <p style="color:#888;font-size:13px;margin-bottom:28px;">This code expires in <strong>3 minutes</strong>.</p>
      <p style="color:#aaa;font-size:12px;">If you did not request this, ignore the email. Your password stays unchanged.</p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. BOOKING REQUEST → Caregiver
// ─────────────────────────────────────────────────────────────────────────────
const bookingRequest = (v: IBookingRequestTemplate): ISendEmail => ({
  to: v.caregiverEmail,
  subject: `New Booking Request — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('New Booking Request', 'Respond within 30 minutes')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.caregiverName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        You have a new booking request. <strong style="color:${WARN};">Please accept or decline within 30 minutes</strong> — the slot is auto-released if there is no response.
      </p>
      ${box(WARN,
    row('Booking ID', v.bookingId) +
    row('Client', v.clientName) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Shift', v.shift) +
    row('Care Recipient', v.careRecipientName) +
    row('Your Rate', `$${v.baseRate.toFixed(2)}`) +
    (v.specialInstructions ? row('Instructions', v.specialInstructions) : '')
  )}
      <p style="color:#888;font-size:13px;margin-top:16px;">Open the Carely app to accept or decline.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  4a. BOOKING CONFIRMED → Client
// ─────────────────────────────────────────────────────────────────────────────
const bookingConfirmedClient = (v: IBookingConfirmedTemplate): ISendEmail => ({
  to: v.clientEmail,
  subject: `Booking Confirmed — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('Booking Confirmed ✓')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.clientName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Your caregiver has <strong style="color:${SUCCESS};">accepted</strong> your booking.
      </p>
      ${box(SUCCESS,
    row('Booking ID', v.bookingId) +
    row('Caregiver', v.caregiverName) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Shift', v.shift) +
    row('Care Recipient', v.careRecipientName) +
    row('Total Charged', `$${v.totalAmount.toFixed(2)}`)
  )}
      ${alert(BRAND, 'Your payment is securely held by Carely and will be released to the caregiver after service completion.')}
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  4b. BOOKING CONFIRMED → Caregiver
// ─────────────────────────────────────────────────────────────────────────────
const bookingConfirmedCaregiver = (v: IBookingConfirmedTemplate): ISendEmail => ({
  to: v.caregiverEmail,
  subject: `You Accepted a Booking — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('Booking Accepted ✓')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.caregiverName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        You confirmed a booking. The <strong>full day is now blocked</strong> on your availability.
      </p>
      ${box(SUCCESS,
    row('Booking ID', v.bookingId) +
    row('Client', v.clientName) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Shift', v.shift) +
    row('Care Recipient', v.careRecipientName) +
    row('Your Earnings', `$${v.baseRate.toFixed(2)} (pending admin release)`)
  )}
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. BOOKING DECLINED → Client
// ─────────────────────────────────────────────────────────────────────────────
const bookingDeclined = (v: IBookingDeclinedTemplate): ISendEmail => ({
  to: v.clientEmail,
  subject: `Booking Declined — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('Booking Declined')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.clientName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        <strong>${v.caregiverName}</strong> has <strong style="color:${DANGER};">declined</strong> your booking.
      </p>
      ${box(DANGER,
    row('Booking ID', v.bookingId) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Shift', v.shift) +
    (v.declineReason ? row('Reason', v.declineReason) : '')
  )}
      ${alert(DANGER, 'A <strong>full refund</strong> will be processed to your original payment method within 5–7 business days.')}
      <p style="color:#555;font-size:14px;margin-top:16px;">Search for another caregiver in the Carely app.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. BOOKING AUTO-RELEASED → Client (cron fires after 30-min hold)
// ─────────────────────────────────────────────────────────────────────────────
const bookingAutoReleased = (v: IBookingAutoReleasedTemplate): ISendEmail => ({
  to: v.clientEmail,
  subject: `Booking Hold Expired — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('Booking Hold Expired')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.clientName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Your booking was held for 30 minutes but <strong>${v.caregiverName}</strong> did not respond. 
        The slot has been <strong style="color:${WARN};">automatically released</strong>.
      </p>
      ${box(WARN,
    row('Booking ID', v.bookingId) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Shift', v.shift)
  )}
      ${alert(WARN, 'A <strong>full refund</strong> will be processed to your original payment method within 5–7 business days.')}
      <p style="color:#555;font-size:14px;margin-top:16px;">Please search for another available caregiver in the app.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  7a. BOOKING COMPLETED → Client
// ─────────────────────────────────────────────────────────────────────────────
const bookingCompletedClient = (v: IBookingCompletedTemplate): ISendEmail => ({
  to: v.clientEmail,
  subject: `Service Completed — ${v.serviceType} on ${v.bookingDate}`,
  html: wrap(`
    ${header('Service Completed ✓')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.clientName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        The care service has been <strong style="color:${SUCCESS};">completed</strong>. We hope it was excellent!
      </p>
      ${box(SUCCESS,
    row('Booking ID', v.bookingId) +
    row('Caregiver', v.caregiverName) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate)
  )}
      <p style="color:#555;font-size:14px;margin-top:16px;">Please leave a review for <strong>${v.caregiverName}</strong> in the app.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  7b. BOOKING COMPLETED → Caregiver
// ─────────────────────────────────────────────────────────────────────────────
const bookingCompletedCaregiver = (v: IBookingCompletedTemplate): ISendEmail => ({
  to: v.caregiverEmail,
  subject: `Service Completed — Earnings Pending Release`,
  html: wrap(`
    ${header('Service Completed ✓', 'Earnings queued for admin release')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.caregiverName}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Great work! The service is <strong style="color:${SUCCESS};">completed</strong>. Your earnings are in <strong>pending</strong> state and will be released by the Carely admin.
      </p>
      ${box(SUCCESS,
    row('Booking ID', v.bookingId) +
    row('Client', v.clientName) +
    row('Service', v.serviceType) +
    row('Date', v.bookingDate) +
    row('Earnings', `$${v.baseRate.toFixed(2)} (pending release)`)
  )}
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  8. CAREGIVER APPROVED
// ─────────────────────────────────────────────────────────────────────────────
const caregiverApproved = (v: ICaregiverApprovedTemplate): ISendEmail => ({
  to: v.email,
  subject: 'Your Carely account has been approved 🎉',
  html: wrap(`
    ${header('Account Approved ✓', 'You can now receive bookings')}
    <div style="background:white;padding:32px 28px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">🎉</div>
      <h2 style="color:${BRAND};font-size:22px;margin:0 0 12px;">Congratulations, ${v.name}!</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;max-width:480px;margin:0 auto 24px;">
        Your caregiver profile and all documents have been <strong style="color:${SUCCESS};">verified</strong>. Your account is fully active.
      </p>
      <div style="background:${LIGHT};border-radius:8px;padding:16px;margin:20px 0;text-align:left;">
        <p style="margin:0;color:#333;font-size:14px;line-height:1.8;">
          ✅ Set your availability in the app<br/>
          ✅ Update your profile bio and hourly rate<br/>
          ✅ Always respond to bookings within <strong>30 minutes</strong>
        </p>
      </div>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  9. CAREGIVER REJECTED
// ─────────────────────────────────────────────────────────────────────────────
const caregiverRejected = (v: ICaregiverRejectedTemplate): ISendEmail => ({
  to: v.email,
  subject: 'Update on your Carely caregiver application',
  html: wrap(`
    ${header('Application Update')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.name}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        After reviewing your application, we are unable to approve your caregiver account at this time.
      </p>
      ${v.reason ? alert(DANGER, `<strong>Reason:</strong> ${v.reason}`) : ''}
      <p style="color:#555;font-size:14px;line-height:1.7;margin-top:16px;">
        If you believe this is in error or wish to re-apply, please contact support or re-submit your documents via the Carely app.
      </p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  10. DOCUMENT VERIFIED
// ─────────────────────────────────────────────────────────────────────────────
const documentVerified = (v: IDocumentVerifiedTemplate): ISendEmail => ({
  to: v.email,
  subject: `Document Verified — ${v.documentType}`,
  html: wrap(`
    ${header('Document Verified ✓')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.name}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Your document has been <strong style="color:${SUCCESS};">verified</strong>.
      </p>
      ${box(SUCCESS, row('Document Type', v.documentType))}
      <p style="color:#555;font-size:14px;">Once all required documents are verified, your account will be fully activated.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  11. DOCUMENT REJECTED
// ─────────────────────────────────────────────────────────────────────────────
const documentRejected = (v: IDocumentRejectedTemplate): ISendEmail => ({
  to: v.email,
  subject: `Action Required — Document Rejected: ${v.documentType}`,
  html: wrap(`
    ${header('Document Rejected')}
    <div style="background:white;padding:32px 28px;">
      <p style="font-size:15px;color:#333;">Hi <strong>${v.name}</strong>,</p>
      <p style="color:#555;font-size:14px;line-height:1.7;">
        Your submitted document was not accepted. Please re-upload a valid document via the app.
      </p>
      ${box(DANGER,
    row('Document Type', v.documentType) +
    (v.reason ? row('Reason', v.reason) : '')
  )}
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
//  12. PAYMENT RELEASED → Caregiver
// ─────────────────────────────────────────────────────────────────────────────
const paymentReleased = (v: IPaymentReleasedTemplate): ISendEmail => ({
  to: v.email,
  subject: `Earnings Released — $${v.amount.toFixed(2)}`,
  html: wrap(`
    ${header('Earnings Released 💰')}
    <div style="background:white;padding:32px 28px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">💰</div>
      <h2 style="color:${SUCCESS};font-size:28px;margin:0 0 8px;">$${v.amount.toFixed(2)}</h2>
      <p style="color:#888;font-size:14px;margin-bottom:24px;">has been released to your Carely wallet</p>
      <div style="text-align:left;">
        ${box(SUCCESS,
    row('Booking ID', v.bookingId) +
    row('Client', v.clientName) +
    row('Service Date', v.bookingDate) +
    row('Amount', `$${v.amount.toFixed(2)}`) +
    row('Released At', new Date().toUTCString())
  )}
      </div>
      <p style="color:#555;font-size:14px;margin-top:8px;">Withdraw via your configured payout method in the Carely app.</p>
      <p style="color:#555;margin-top:20px;">Best regards,<br/><strong style="color:${BRAND};">The Carely Team</strong></p>
    </div>
    ${footer()}`),
});

// ─────────────────────────────────────────────────────────────────────────────
export const emailTemplate = {
  createAccount,
  resetPassword,
  bookingRequest,
  bookingConfirmedClient,
  bookingConfirmedCaregiver,
  bookingDeclined,
  bookingAutoReleased,
  bookingCompletedClient,
  bookingCompletedCaregiver,
  caregiverApproved,
  caregiverRejected,
  documentVerified,
  documentRejected,
  paymentReleased,
};