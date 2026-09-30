import fs from "fs";
import path from "path";

import {
  ALLOWED_DATASET_FILES,
  BASELINE_DATASET_NAME,
  getUserOverrideDir,
} from "./transcompDatasetOverrides.js";
import { resolveRepoPath } from "./paths.js";

const SAVED_DATASETS_ROOT = resolveRepoPath("TransCompModel", "data", "saved_datasets");
const MAX_SAVED_DATASETS_PER_USER = 5;
const MAX_SAVED_DATASET_BYTES_PER_USER = 100 * 1024 * 1024;

function sanitizeUserId(userId) {
  return String(userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeDatasetName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function getUserSavedDatasetsRoot(userId) {
  return path.join(SAVED_DATASETS_ROOT, sanitizeUserId(userId));
}

function getSavedDatasetDir(userId, slug) {
  return path.join(getUserSavedDatasetsRoot(userId), slug);
}

function getCurrentOverrideSummary(userId) {
  const overrideDir = getUserOverrideDir(userId);
  const changedFiles = ALLOWED_DATASET_FILES.filter((filename) =>
    fs.existsSync(path.join(overrideDir, filename))
  );

  const sizeBytes = changedFiles.reduce((sum, filename) => {
    const filePath = path.join(overrideDir, filename);
    return sum + fs.statSync(filePath).size;
  }, 0);

  return { changedFiles, sizeBytes };
}

function writeSavedDatasetSnapshot(userId, slug, name, changedFiles) {
  const sourceDir = getUserOverrideDir(userId);
  const snapshotDir = getSavedDatasetDir(userId, slug);

  removeDir(snapshotDir);
  ensureDir(snapshotDir);

  let sizeBytes = 0;
  for (const filename of changedFiles) {
    const sourcePath = path.join(sourceDir, filename);
    const destinationPath = path.join(snapshotDir, filename);
    fs.copyFileSync(sourcePath, destinationPath);
    sizeBytes += fs.statSync(destinationPath).size;
  }

  const manifest = {
    name,
    slug,
    baselineDatasetName: BASELINE_DATASET_NAME,
    changedFiles,
    sizeBytes,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  return {
    snapshotDir,
    sizeBytes,
    relativePath: path.relative(resolveRepoPath("TransCompModel", "data"), snapshotDir).replaceAll("\\", "/"),
  };
}

function restoreSavedDatasetSnapshot(userId, slug) {
  const snapshotDir = getSavedDatasetDir(userId, slug);
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Saved dataset snapshot not found: ${snapshotDir}`);
  }

  const overrideDir = getUserOverrideDir(userId);
  removeDir(overrideDir);
  ensureDir(overrideDir);

  const changedFiles = ALLOWED_DATASET_FILES.filter((filename) =>
    fs.existsSync(path.join(snapshotDir, filename))
  );

  for (const filename of changedFiles) {
    fs.copyFileSync(path.join(snapshotDir, filename), path.join(overrideDir, filename));
  }

  return changedFiles;
}

function deleteSavedDatasetSnapshot(userId, slug) {
  removeDir(getSavedDatasetDir(userId, slug));
}

export {
  BASELINE_DATASET_NAME,
  MAX_SAVED_DATASETS_PER_USER,
  MAX_SAVED_DATASET_BYTES_PER_USER,
  SAVED_DATASETS_ROOT,
  deleteSavedDatasetSnapshot,
  getCurrentOverrideSummary,
  getSavedDatasetDir,
  getUserSavedDatasetsRoot,
  normalizeDatasetName,
  restoreSavedDatasetSnapshot,
  writeSavedDatasetSnapshot,
};
