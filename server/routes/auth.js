// server/routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // <-- adjust path if needed
import Config from "../models/Config.js"
import { sendEmail } from "../utils/emailService.js";


const router = express.Router();

/** -----------------------
 * Helpers
 * ---------------------- */


function signJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing in env");
  return jwt.sign({ id: user._id }, secret, { expiresIn: "24h" });
}

export function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ message: "Invalid/missing token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET missing in env");

    const payload = jwt.verify(token, secret);
    req.userId = payload.id;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid/missing token" });
  }
}

async function sendVerificationEmail({ to, token }) {
  const { FRONTEND_URL } = process.env;
  if (!FRONTEND_URL) throw new Error("FRONTEND_URL missing in env");

  const verifyUrl = `${FRONTEND_URL.replace(/\/$/, "")}/verify-email/${token}`;

  await sendEmail({
    to,
    subject: "Verify your email",
    text: `Verify your email by clicking this link: ${verifyUrl}`,
    html: `<p>Verify your email by clicking this link:</p>
           <p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
}

async function sendPasswordResetEmail({ to, token }) {
  const { FRONTEND_URL } = process.env;
  if (!FRONTEND_URL) throw new Error("FRONTEND_URL missing in env");

  const resetUrl = `${FRONTEND_URL.replace(/\/$/, "")}/reset-password/${token}`;

  await sendEmail({
    to,
    subject: "Reset your password",
    text: `Reset your password by clicking this link: ${resetUrl}`,
    html: `<p>Reset your password by clicking this link:</p>
           <p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}

async function sendDeleteAccountEmail({ to, token }) {
  const { FRONTEND_URL } = process.env;
  if (!FRONTEND_URL) throw new Error("FRONTEND_URL missing in env");

  const deleteUrl = `${FRONTEND_URL.replace(/\/$/, "")}/delete-account/${token}`;

  await sendEmail({
    to,
    subject: "Confirm account deletion",
    text: `Confirm your account deletion by clicking this link: ${deleteUrl}`,
    html: `<p>Confirm your account deletion by clicking this link:</p>
           <p><a href="${deleteUrl}">${deleteUrl}</a></p>`,
  });
}

export function getAdminApprovalEmail() {
  const explicit = (process.env.ADMIN_APPROVAL_EMAIL || "").trim();
  if (explicit) return explicit;

  const fallback = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return fallback[0] || "";
}

async function sendAdminApprovalRequestEmail({ username, email, token }) {
  const adminEmail = getAdminApprovalEmail();
  if (!adminEmail) {
    console.warn("ADMIN_APPROVAL_EMAIL missing in env; no admin approval email sent");
    return;
  }

  const { FRONTEND_URL } = process.env;
  const base = FRONTEND_URL ? FRONTEND_URL.replace(/\/$/, "") : "http://localhost:3000";
  const approveUrl = `${base}/api/auth/approve-registration/${token}`;
  const rejectUrl = `${base}/api/auth/reject-registration/${token}`;

  await sendEmail({
    to: adminEmail,
    subject: "New user registration requires your approval",
    text: `New user registration from ${username} (${email}) requires your approval. Approve: ${approveUrl}\nReject: ${rejectUrl}`,
    html: `
      <p><strong>New user registration requires your approval.</strong></p>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>
        <a href="${approveUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">Approve</a>
        &nbsp;
        <a href="${rejectUrl}" style="display:inline-block;padding:10px 16px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">Reject</a>
      </p>
    `,
  });
}

/** -----------------------
 * POST /api/auth/register
 * ---------------------- */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Username/email not taken
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already taken" });
    }

  

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create verification token (expires in 24h)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create user
    const user = await User.create({
      username,
      email: normalizedEmail,
      passwordHash,
      role: "pending",
      emailVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    try {
      await sendVerificationEmail({ to: user.email, token: verificationToken });
    } catch (emailErr) {
      console.error("EMAIL SEND FAILED:", emailErr);
      console.error("EMAIL SEND FAILED message:", emailErr?.message);
      console.error("EMAIL SEND FAILED response:", emailErr?.response);
      console.error("EMAIL SEND FAILED stack:", emailErr?.stack);
    
      return res.status(500).json({ message: "Email send failed" });
    }

    return res.json({
      message: "Check your email to verify",
      userId: user._id,
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** --------------------------------
 * GET /api/auth/verify-email/:token
 * -------------------------------- */
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    if (user.emailVerified) {
      return res.status(200).json({ message: "Email already verified. The admin review is pending." });
    }

    if (!user.verificationTokenExpires || user.verificationTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const adminApprovalToken = crypto.randomBytes(32).toString("hex");
    const adminApprovalTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    user.emailVerified = true;
    user.role = "pending";
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    user.adminApprovalToken = adminApprovalToken;
    user.adminApprovalTokenExpires = adminApprovalTokenExpires;
    await user.save();

    try {
      await sendAdminApprovalRequestEmail({
        username: user.username,
        email: user.email,
        token: adminApprovalToken,
      });
    } catch (emailErr) {
      console.error("ADMIN APPROVAL EMAIL ERROR:", emailErr);
    }

    return res.json({
      message: "Email verified! Your request is pending admin approval.",
    });
  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/approve-registration/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ adminApprovalToken: token });

    if (!user || !user.adminApprovalTokenExpires || user.adminApprovalTokenExpires.getTime() < Date.now()) {
      return res.status(400).send("Invalid or expired approval token.");
    }

    if (user.role === "approved") {
      return res.status(200).send("This registration has already been approved.");
    }

    user.role = "approved";
    user.adminApprovalToken = null;
    user.adminApprovalTokenExpires = null;
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: "Your account has been approved",
        text: `Hi ${user.username}, your account has been approved. You can now log in.`,
        html: `<p>Hi ${user.username},</p><p>Your account has been <strong>approved</strong>. You can now log in.</p>`,
      });
    } catch (emailErr) {
      console.error("APPROVAL NOTIFICATION EMAIL ERROR:", emailErr);
    }

    return res.status(200).send(`User ${user.username} approved successfully.`);
  } catch (err) {
    console.error("APPROVE REGISTRATION ERROR:", err);
    return res.status(500).send("Server error");
  }
});

router.get("/reject-registration/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ adminApprovalToken: token });

    if (!user || !user.adminApprovalTokenExpires || user.adminApprovalTokenExpires.getTime() < Date.now()) {
      return res.status(400).send("Invalid or expired approval token.");
    }

    user.role = "rejected";
    user.adminApprovalToken = null;
    user.adminApprovalTokenExpires = null;
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: "Your account request has been rejected",
        text: `Hi ${user.username}, your account request has been rejected.`,
        html: `<p>Hi ${user.username},</p><p>Your account request has been <strong>rejected</strong>.</p>`,
      });
    } catch (emailErr) {
      console.error("REJECTION NOTIFICATION EMAIL ERROR:", emailErr);
    }

    return res.status(200).send(`User ${user.username} rejected successfully.`);
  } catch (err) {
    console.error("REJECT REGISTRATION ERROR:", err);
    return res.status(500).send("Server error");
  }
});


/** -----------------------
 * POST /api/auth/login
 * ---------------------- */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(401).json({ message: "Invalid username/password" });
    }

    const identifier = String(username).trim();
    const isEmail = identifier.includes("@");

    const user = await User.findOne(
      isEmail ? { email: identifier.toLowerCase() } : { username: identifier }
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid username/password" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid username/password" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: "Email not verified" });
    }

    if (user.role === "pending") {
      return res.status(403).json({ message: "Account pending admin approval" });
    }

    if (user.role === "rejected") {
      return res.status(403).json({ message: "Account rejected by admin" });
    }

    // role must be 'approved'
    const token = signJwt(user);

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * POST /api/auth/forgot-password
 * ---------------------- */
router.post("/forgot-password", async (req, res) => {
  try {
    const normalizedEmail = String(req.body?.email || "").toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    const passwordResetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = passwordResetToken;
    user.passwordResetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    await sendPasswordResetEmail({ to: user.email, token: passwordResetToken });

    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * POST /api/auth/reset-password/:token
 * ---------------------- */
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body || {};

    if (!password || !confirmPassword) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = await User.findOne({ passwordResetToken: token });
    if (!user || !user.passwordResetTokenExpires || user.passwordResetTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetTokenExpires = null;
    await user.save();

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * POST /api/auth/delete-account/request
 * ---------------------- */
router.post("/delete-account/request", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const deleteAccountToken = crypto.randomBytes(32).toString("hex");
    user.deleteAccountToken = deleteAccountToken;
    user.deleteAccountTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    await sendDeleteAccountEmail({ to: user.email, token: deleteAccountToken });

    return res.json({ message: "Check your email to confirm account deletion." });
  } catch (err) {
    console.error("DELETE ACCOUNT REQUEST ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * POST /api/auth/delete-account/:token
 * ---------------------- */
router.post("/delete-account/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ deleteAccountToken: token });
    if (!user || !user.deleteAccountTokenExpires || user.deleteAccountTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    await Config.deleteMany({ owner: user._id });
    await User.deleteOne({ _id: user._id });

    return res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("DELETE ACCOUNT CONFIRM ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * GET /api/auth/me
 * ---------------------- */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(404).json({ message: "User not found" });

    const configs = await Config.find({ owner: userId })
      .select("filename model mimeType size createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    const user = await User.findById(userId)

    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      configs,
      
    });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** -----------------------
 * POST /api/auth/logout (optional)
 * ---------------------- */
router.post("/logout", (_req, res) => {
  // JWT is stateless; client should remove token.
  return res.json({ message: "Logged out" });
});

export default router;
