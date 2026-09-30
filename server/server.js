// server.js (ESM)
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { resolveRepoPath } from "./utils/paths.js";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";

import empireResults from "./routes/empire/results.js";
import empireInputData from "./routes/empire/inputData.js";
import empireModelRunner from "./routes/empire/modelRunner.js";
import empireRunHistory from "./routes/empire/runHistory.js";
import empireConfig from "./routes/empire/config.js";

import emxResults from "./routes/emx/results.js";
import emxModelRunner from "./routes/emx/modelRunner.js";
import emxRunHistory from "./routes/emx/runHistory.js";
import emxConfig from "./routes/emx/config.js";

import transcompConfig from "./routes/transcomp/config.js";
import transcompInputData from "./routes/transcomp/inputData.js";
import transcompModelRunner from "./routes/transcomp/modelRunner.js";
import transcompRunHistory from "./routes/transcomp/runHistory.js";
import transcompResults from "./routes/transcomp/results.js";

import gcamConfig from "./routes/gcam/config.js";
import gcamModelRunner from "./routes/gcam/modelRunner.js";
import gcamRunHistory from "./routes/gcam/runHistory.js";
import gcamResults from "./routes/gcam/results.js";

import ukraineConfig from "./routes/ukraine/config.js";
import ukraineModelRunner from "./routes/ukraine/modelRunner.js";
import ukraineRunHistory from "./routes/ukraine/runHistory.js";
import ukraineResults from "./routes/ukraine/results.js";

import requireAuth from "./middleware/requireAuth.js";
import requireAdmin from "./middleware/requireAdmin.js";

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_ALT,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS blocked"));
    },
    credentials: true,
  })
);

app.use(express.json());

// Static excel uploads
const uploadDir = resolveRepoPath("OpenEMPIRE", "Data handler", "uploads");
app.use("/api/files", express.static(uploadDir));

// MongoDB Connection
await mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

// Public
app.use("/api/auth", authRoutes);

// Admin only
app.use("/api/admin", requireAdmin, adminRoutes);

// Protected (Empire)
app.use("/api/results", requireAuth, empireResults);
app.use("/api/upload", requireAuth, empireInputData);
app.use("/api/shell", requireAuth, empireModelRunner);
app.use("/api/runs", requireAuth, empireRunHistory);
app.use("/api/config", requireAuth, empireConfig);

app.use("/api/emx/results", requireAuth, emxResults);
app.use("/api/emx/runModel", requireAuth, emxModelRunner);
app.use("/api/emx/runHistory", requireAuth, emxRunHistory);
app.use("/api/emx/config", requireAuth, emxConfig);

app.use("/api/transcomp/config", requireAuth, transcompConfig);
app.use("/api/transcomp/data", requireAuth, transcompInputData);
app.use("/api/transcomp/runModel", requireAuth, transcompModelRunner);
app.use("/api/transcomp/runHistory", requireAuth, transcompRunHistory);
app.use("/api/transcomp/results", requireAuth, transcompResults);

app.use("/api/gcam/config", requireAuth, gcamConfig);
app.use("/api/gcam/runModel", requireAuth, gcamModelRunner);
app.use("/api/gcam/runHistory", requireAuth, gcamRunHistory);
app.use("/api/gcam/results", requireAuth, gcamResults);

// Protected (Ukraine FBMC — plan task 2.5; display name "PyPSA Ukraine FBMC")
app.use("/api/ukraine/config", requireAuth, ukraineConfig);
app.use("/api/ukraine/runModel", requireAuth, ukraineModelRunner);
app.use("/api/ukraine/runHistory", requireAuth, ukraineRunHistory);
app.use("/api/ukraine/results", requireAuth, ukraineResults);

// Local-development EMX routes are currently left open so the frontend can
// talk to a local backend without depending on the remote auth token/session.
app.use("/api/emx/results", emxResults);
app.use("/api/emx/runModel", emxModelRunner);
app.use("/api/emx/runHistory", emxRunHistory);
app.use("/api/emx/config", emxConfig);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
