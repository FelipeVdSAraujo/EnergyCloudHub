// server/utils/emailService.js (ESM)
import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const {
    EMAIL_SERVICE,
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_SECURE,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_SMTP,
  } = process.env;

  // Option A: SMTP host/port (MailHog, Mailtrap, SendGrid SMTP, Office365 SMTP, etc.)
  if (EMAIL_HOST) {
    const port = EMAIL_PORT ? Number(EMAIL_PORT) : 587;
    const secure =
      EMAIL_SECURE !== undefined
        ? EMAIL_SECURE === "true"
        : port === 465; // default heuristic

    const password = EMAIL_PASSWORD || EMAIL_SMTP;

    if (!EMAIL_USER || !password) {
      throw new Error("Missing EMAIL_USER / EMAIL_PASSWORD for SMTP host config");
    }

    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port,
      secure,
      auth: {
        user: EMAIL_USER,
        pass: password,
      },
    });

    return transporter;
  }

  // Option B: Nodemailer "service" (gmail, etc.)
  const password = EMAIL_PASSWORD || EMAIL_SMTP;

  if (!EMAIL_SERVICE || !EMAIL_USER || !password) {
    throw new Error(
      "Missing EMAIL_SERVICE or EMAIL_HOST, and/or EMAIL_USER / EMAIL_PASSWORD in env"
    );
  }

  transporter = nodemailer.createTransport({
    service: EMAIL_SERVICE,
    auth: {
      user: EMAIL_USER,
      pass: password,
    },
  });

  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  const { EMAIL_FROM, EMAIL_USER } = process.env;
  const from = EMAIL_FROM || EMAIL_USER;

  const t = getTransporter();
  return t.sendMail({ from, to, subject, text, html });
}
