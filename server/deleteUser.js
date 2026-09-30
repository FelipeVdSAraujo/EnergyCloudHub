import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";

const username = process.argv[2] || "Zurich";

await mongoose.connect(process.env.MONGO_URL);

try {
  const result = await User.deleteOne({ username });
  console.log(`✅ Deleted ${result.deletedCount} user(s) with username "${username}"`);
  if (result.deletedCount === 0) {
    console.log(`⚠️  No user found with username "${username}"`);
  }
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}
