import crypto from "crypto";
import fs from "fs";
import path from "path";

import { resolveRepoPath } from "./paths.js";

const BASELINE_DATASET_NAME = "europe_v51";
const DATA_HANDLER_DIR = resolveRepoPath("OpenEMPIRE", "Data handler");
const BASELINE_DATASET_DIR = path.resolve(DATA_HANDLER_DIR, BASELINE_DATASET_NAME);
const UPLOADS_DATASET_DIR = path.resolve(DATA_HANDLER_DIR, "uploads");
const USER_OVERRIDES_ROOT = path.resolve(DATA_HANDLER_DIR, "user_overrides");

const ALLOWED_DATASET_FILES = [
  "General.xlsx",
  "Generator.xlsx",
  "Node.xlsx",
  "Sets.xlsx",
  "Storage.xlsx",
  "Transmission.xlsx",
];

function sanitizeUserId(userId) {
  return String(userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDirectory(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function isAllowedDatasetFilename(filename) {
  return ALLOWED_DATASET_FILES.includes(filename);
}

function getUserOverrideDir(userId) {
  const safeUserId = sanitizeUserId(userId);
  return path.join(USER_OVERRIDES_ROOT, safeUserId);
}

function getUserOverrideFilePath(userId, filename) {
  return path.join(getUserOverrideDir(userId), filename);
}

/** SHA-256 of a Buffer or string. */
function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Compute a digest of the user's effective dataset (baseline + overrides)
 * WITHOUT materializing anything to the shared uploads/ folder.
 * Produces the same hash that buildDatasetDigest would produce on the
 * materialized folder, making it safe to call before acquiring the run lock.
 */
function buildEffectiveDatasetDigest(userId) {
  const fileHashes = [];
  for (const filename of ALLOWED_DATASET_FILES) {
    const filePath = getEffectiveDatasetFilePath(userId, filename);
    if (fs.existsSync(filePath)) {
      fileHashes.push(`${filename}:${sha256(fs.readFileSync(filePath))}`);
    }
  }
  return sha256(fileHashes.join("\n"));
}

function getEffectiveDatasetFilePath(userId, filename) {
  const overridePath = getUserOverrideFilePath(userId, filename);
  if (fs.existsSync(overridePath)) {
    return overridePath;
  }
  return path.join(BASELINE_DATASET_DIR, filename);
}

function getEffectiveDatasetFiles(userId) {
  return ALLOWED_DATASET_FILES.filter((filename) => fs.existsSync(getEffectiveDatasetFilePath(userId, filename)));
}

function saveUserOverrideFile(userId, sourceFilePath, filename) {
  if (!isAllowedDatasetFilename(filename)) {
    throw new Error(`Invalid filename: ${filename}`);
  }
  const overrideDir = getUserOverrideDir(userId);
  ensureDir(overrideDir);
  fs.copyFileSync(sourceFilePath, path.join(overrideDir, filename));
}

function resetUserOverrides(userId) {
  const overrideDir = getUserOverrideDir(userId);
  if (fs.existsSync(overrideDir)) {
    fs.rmSync(overrideDir, { recursive: true, force: true });
  }
}

function buildUploadsFromUserOverrides(userId) {
  if (!fs.existsSync(BASELINE_DATASET_DIR)) {
    throw new Error(`Baseline dataset not found: ${BASELINE_DATASET_DIR}`);
  }

  if (fs.existsSync(UPLOADS_DATASET_DIR)) {
    fs.rmSync(UPLOADS_DATASET_DIR, { recursive: true, force: true });
  }

  copyDirectory(BASELINE_DATASET_DIR, UPLOADS_DATASET_DIR);

  // Ensure both .gitignore and .gitkeep are always present in uploads/
  // These files control which contents are tracked in version control.
  const uploadsGitignore = path.join(UPLOADS_DATASET_DIR, ".gitignore");
  const uploadsGitkeep = path.join(UPLOADS_DATASET_DIR, ".gitkeep");
  
  // Remove .gitignore if it exists (baseline may have copied it)
  if (fs.existsSync(uploadsGitignore)) {
    fs.rmSync(uploadsGitignore, { force: true });
  }
  
  // Always ensure .gitkeep exists (empty marker file for folder persistence)
  fs.writeFileSync(uploadsGitkeep, "", "utf8");

  const overrideDir = getUserOverrideDir(userId);
  if (!fs.existsSync(overrideDir)) {
    return UPLOADS_DATASET_DIR;
  }

  for (const filename of ALLOWED_DATASET_FILES) {
    const overrideFile = path.join(overrideDir, filename);
    if (fs.existsSync(overrideFile)) {
      fs.copyFileSync(overrideFile, path.join(UPLOADS_DATASET_DIR, filename));
    }
  }

  return UPLOADS_DATASET_DIR;
}

function buildDatasetSnapshotFromUserOverrides(userId, targetDir) {
  if (!targetDir) {
    throw new Error("targetDir is required");
  }
  if (!fs.existsSync(BASELINE_DATASET_DIR)) {
    throw new Error(`Baseline dataset not found: ${BASELINE_DATASET_DIR}`);
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  copyDirectory(BASELINE_DATASET_DIR, targetDir);

  const overrideDir = getUserOverrideDir(userId);
  if (!fs.existsSync(overrideDir)) {
    return targetDir;
  }

  for (const filename of ALLOWED_DATASET_FILES) {
    const overrideFile = path.join(overrideDir, filename);
    if (fs.existsSync(overrideFile)) {
      fs.copyFileSync(overrideFile, path.join(targetDir, filename));
    }
  }

  return targetDir;
}

export {
  ALLOWED_DATASET_FILES,
  BASELINE_DATASET_DIR,
  BASELINE_DATASET_NAME,
  UPLOADS_DATASET_DIR,
  USER_OVERRIDES_ROOT,
  buildDatasetSnapshotFromUserOverrides,
  buildEffectiveDatasetDigest,
  buildUploadsFromUserOverrides,
  getEffectiveDatasetFilePath,
  getEffectiveDatasetFiles,
  getUserOverrideDir,
  isAllowedDatasetFilename,
  resetUserOverrides,
  saveUserOverrideFile,
};
