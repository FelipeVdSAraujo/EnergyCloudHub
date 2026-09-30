import express from "express";
import { sendEmail } from "../utils/emailService.js";
import User from "../models/User.js";

const router = express.Router();

async function sendAdminDecisionEmail({ to, subject, text, html }) {
  await sendEmail({ to, subject, text, html });
}

router.get("/users", async (req, res) => {
  try {
    const { role } = req.query;

    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter)
      .select("username email role emailVerified createdAt")
      .sort({ createdAt: -1 });

    return res.json(
      users.map((u) => ({
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    console.error("LIST USERS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/users/:userId/approve", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("username email role emailVerified createdAt");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "approved") {
      return res.status(409).json({ message: "User already approved" });
    }

    user.role = "approved";
    await user.save();

    try {
      await sendAdminDecisionEmail({
        to: user.email,
        subject: "Your account has been approved",
        text: `Hi ${user.username}, your account has been approved. You can now log in.`,
        html: `<p>Hi ${user.username},</p><p>Your account has been <b>approved</b>. You can now log in.</p>`,
      });
    } catch (emailErr) {
      console.error("APPROVAL EMAIL ERROR:", emailErr);
    }

    return res.json({
      message: "User approved",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("APPROVE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/users/:userId/reject", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};

    const user = await User.findById(userId).select("username email role emailVerified createdAt");
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = "rejected";
    await user.save();

    const reasonText = reason ? `Reason: ${reason}` : "No reason provided.";

    try {
      await sendAdminDecisionEmail({
        to: user.email,
        subject: "Your account has been rejected",
        text: `Hi ${user.username}, your account has been rejected. ${reasonText}`,
        html: `<p>Hi ${user.username},</p><p>Your account has been <b>rejected</b>.</p><p>${reasonText}</p>`,
      });
    } catch (emailErr) {
      console.error("REJECTION EMAIL ERROR:", emailErr);
    }

    return res.json({
      message: "User rejected",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("REJECT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
