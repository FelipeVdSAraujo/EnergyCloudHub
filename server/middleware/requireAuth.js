  import jwt from "jsonwebtoken";
  import User from "../models/User.js";

  export default async function requireAuth(req, res, next) {

    try {
      const header = req.headers.authorization || "";
      const [type, headerToken] = header.split(" ");
      const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
      const token = type === "Bearer" && headerToken ? headerToken : queryToken;

      if (!token) {
        return res.status(401).json({ message: "Type not bearer" });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("JWT_SECRET missing in env");

      const payload = jwt.verify(token, secret);
      const userId = payload?.id;

      if (!userId) {
        return res.status(401).json({ message: "no user id token" });
      }

      // Make sure user still exists
      const user = await User.findById(userId).select(
        "username email role emailVerified createdAt"
      );

      if (!user) {
        return res.status(401).json({ message: "no user" });
      }

      // Must be verified
      if (!user.emailVerified) {
        return res.status(403).json({ message: "Email not verified" });
      }

      // Must be approved OR admin
      if (user.role !== "approved" && user.role !== "admin") {
        if (user.role === "pending") {
          return res.status(403).json({ message: "Account pending admin approval" });
        }
        if (user.role === "rejected") {
          return res.status(403).json({ message: "Account rejected by admin" });
        }
        return res.status(403).json({ message: "Account not allowed" });
      }

      // Attach req.user
      req.user = {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      };

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token" });
      }
      console.error("AUTH ERROR:", err);
      return res.status(401).json({ message: "Auth error" });
    }
  }
