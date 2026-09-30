// scripts/send-test-email.js
import "dotenv/config";
import { sendEmail } from "../utils/emailService.js";

const to = process.argv[2];

if (!to) {
  console.error("Usage: node scripts/send-test-email.js <recipient>");
  process.exit(1);
}

try {
  await sendEmail({
    to,
    subject: "EnSolveCloud SMTP test",
    text: "This is a test email sent via Brevo SMTP.",
    html: "<p>This is a test email sent via <b>Brevo SMTP</b>.</p>",
  });

  console.log(`Test email sent to ${to}`);
} catch (err) {
  console.error("Failed to send test email:", err?.message || err);
  process.exit(1);
}
