// server/scripts/create-admin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js"; // adjust path if needed

function parseArgs(argv) {
  // Supports: --username=admin --email=a@b.com --password=pass
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, ...rest] = arg.slice(2).split("=");
    out[k] = rest.join("=") || true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username;
  const email = args.email;
  const password = args.password;

  if (!username || !email || !password) {
    console.error(
      "Usage: node server/scripts/create-admin.js --username=admin --email=admin@example.com --password=tempPassword"
    );
    process.exit(1);
  }

  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const normalizedEmail = String(email).toLowerCase().trim();

  // Prevent duplicates
  const existing = await User.findOne({
    $or: [{ username }, { email: normalizedEmail }],
  });

  if (existing) {
    console.error("Admin user already exists with that username or email.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const adminUser = await User.create({
    username,
    email: normalizedEmail,
    passwordHash,
    role: "approved",
    emailVerified: true,
    verificationToken: null,
    verificationTokenExpires: null,
  });

  console.log("✅ Admin user created:");
  console.log({
    id: String(adminUser._id),
    username: adminUser.username,
    email: adminUser.email,
    role: adminUser.role,
    emailVerified: adminUser.emailVerified,
  });

  console.log("\nAdd one of these to your .env so this user is treated as admin:");
  console.log(`ADMIN_EMAILS=${adminUser.email}`);
  console.log(`ADMIN_USERNAMES=${adminUser.username}`);
  console.log("\n(You can store multiple values comma-separated.)");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("CREATE ADMIN ERROR:", err);
  process.exit(1);
});
