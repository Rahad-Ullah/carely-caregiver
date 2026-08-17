import nodemailer     from 'nodemailer';
import config         from '../config';
import { logger, errorLogger } from '../shared/logger';
import { ISendEmail } from '../types/emailTemplate';

const transporter = nodemailer.createTransport({
  host:   config.email.host,
  port:   Number(config.email.port),
  secure: true,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

const sendEmail = async (values: ISendEmail): Promise<void> => {
  try {
    const info = await transporter.sendMail({
      from:    `"Carely Caregiver" <${config.email.from}>`,
      to:      values.to,
      subject: values.subject,
      html:    values.html,
    });
    logger.info(' Mail sent successfully', info.accepted);
  } catch (error) {
    errorLogger.error(' Email send failed:', error);
  }
};

export const emailHelper = { sendEmail };
