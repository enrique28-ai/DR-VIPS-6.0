import { getEmailSubjects, getEmailTemplates } from "./emailTemplates.js";
import { transporter, fromAddress } from "./gmail.js";

export const sendVerificationEmail = async (email, verificationToken, lang = "en") => {
  try {
    const subjects = getEmailSubjects(lang);
    const { VERIFICATION_EMAIL_TEMPLATE } = getEmailTemplates(lang);

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: subjects.verify,
      html: VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", verificationToken),
    });
  } catch (error) {
    throw new Error(`Error sending verification email: ${error?.message || error}`);
  }
};

export const sendWelcomeEmail = async (email, name, lang = "en") => {
  try {
    const subjects = getEmailSubjects(lang);
    const { WELCOME_EMAIL_TEMPLATE } = getEmailTemplates(lang);

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: subjects.welcome,
      html: WELCOME_EMAIL_TEMPLATE.replace("{name}", name),
    });
  } catch (error) {
    throw new Error(`Error sending welcome email: ${error?.message || error}`);
  }
};

export const sendPasswordResetCodeEmail = async (email, resetCode, lang = "en") => {
  try {
    const subjects = getEmailSubjects(lang);
    const { PASSWORD_RESET_CODE_TEMPLATE } = getEmailTemplates(lang);

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: subjects.resetCode || subjects.resetReq,
      html: PASSWORD_RESET_CODE_TEMPLATE.replace("{resetCode}", resetCode),
    });
  } catch (error) {
    throw new Error(`Error sending password reset code email: ${error?.message || error}`);
  }
};

export const sendResetSuccessEmail = async (email, lang = "en") => {
  try {
    const subjects = getEmailSubjects(lang);
    const { PASSWORD_RESET_SUCCESS_TEMPLATE } = getEmailTemplates(lang);

    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: subjects.resetOk,
      html: PASSWORD_RESET_SUCCESS_TEMPLATE,
    });
  } catch (error) {
    throw new Error(`Error sending password reset success email: ${error?.message || error}`);
  }
};
