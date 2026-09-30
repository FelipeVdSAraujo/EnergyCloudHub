import requireAuth from "./requireAuth.js";

function isAllowlistedAdmin(user) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const adminUsernames = (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    adminEmails.includes(String(user.email).toLowerCase()) ||
    adminUsernames.includes(String(user.username))
  );
}

export default function requireAdmin(req, res, next) {
  // Run normal auth first (attaches req.user)
  return requireAuth(req, res, () => {
    // Primary rule: role must be admin
    const isDbAdmin = req.user?.role === "admin";

    // Optional fallback: env allowlist (useful for initial admin bootstrapping)
    const isEnvAdmin = req.user ? isAllowlistedAdmin(req.user) : false;

    if (!isDbAdmin && !isEnvAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    return next();
  });
}
