import fs from "fs";
import path from "path";
import crypto from "crypto";

import { resolveRepoPath } from "./paths.js";

const BASELINE_DATASET_NAME = "basque_country";
const BASELINE_DATASET_DIR = resolveRepoPath("TransCompModel", "examples", "Basque country", "data", BASELINE_DATASET_NAME);
const USER_OVERRIDES_ROOT = resolveRepoPath("TransCompModel", "data", "user_overrides");

const REQUIRED_DATASET_FILES = [
  "Model.yaml",
  "GeographicElement.yaml",
  "Mode.yaml",
  "Product.yaml",
  "Path.yaml",
  "Fuel.yaml",
  "Technology.yaml",
  "Vehicletype.yaml",
  "TechVehicle.yaml",
  "InitialVehicleStock.yaml",
  "InitialFuelingInfr.yaml",
  "InitialModeInfr.yaml",
  "FinancialStatus.yaml",
  "Regiontype.yaml",
  "Odpair.yaml",
  "Speed.yaml",
];

const OPTIONAL_DATASET_FILES = [
  "Node.yaml",
  "InitDetourTime.yaml",
  "Initial_Mode_Share.yaml",
  "ModeShares.yaml",
  "ModeSharemaxbyyear.yaml",
  "ModeShareminbyyear.yaml",
  "MarketShares.yaml",
  "EmissionLimitbymode.yaml",
  "EmissionLimitbyyear.yaml",
  "VehicleSubsidy.yaml",
  "DetourTimeReduction.yaml",
  "SupplyType.yaml",
  "InitialSupplyInfr.yaml",
];

const ALLOWED_DATASET_FILES = [...new Set([...REQUIRED_DATASET_FILES, ...OPTIONAL_DATASET_FILES])];

function sanitizeUserId(userId) {
  return String(userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getUserOverrideDir(userId) {
  return path.join(USER_OVERRIDES_ROOT, sanitizeUserId(userId));
}

function isAllowedDatasetFilename(filename) {
  return ALLOWED_DATASET_FILES.includes(filename);
}

function getUserOverrideFilePath(userId, filename) {
  return path.join(getUserOverrideDir(userId), filename);
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

function resetUserOverrides(userId) {
  const overrideDir = getUserOverrideDir(userId);
  if (fs.existsSync(overrideDir)) {
    fs.rmSync(overrideDir, { recursive: true, force: true });
  }
}

function getCurrentOverrideSummary(userId) {
  const overrideDir = getUserOverrideDir(userId);
  const changedFiles = ALLOWED_DATASET_FILES.filter((filename) => fs.existsSync(path.join(overrideDir, filename)));
  const sizeBytes = changedFiles.reduce((sum, filename) => {
    const filePath = path.join(overrideDir, filename);
    return sum + fs.statSync(filePath).size;
  }, 0);

  return { changedFiles, sizeBytes };
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function buildEffectiveDatasetDigest(userId) {
  const hashes = [];
  for (const filename of ALLOWED_DATASET_FILES) {
    const filePath = getEffectiveDatasetFilePath(userId, filename);
    if (fs.existsSync(filePath)) {
      hashes.push(`${filename}:${sha256(fs.readFileSync(filePath))}`);
    }
  }
  return sha256(hashes.join("\n"));
}

function validateDatasetCompleteness(userId) {
  const missingRequiredFiles = REQUIRED_DATASET_FILES.filter(
    (filename) => !fs.existsSync(getEffectiveDatasetFilePath(userId, filename))
  );

  return {
    valid: missingRequiredFiles.length === 0,
    missingRequiredFiles,
  };
}

export {
  ALLOWED_DATASET_FILES,
  BASELINE_DATASET_DIR,
  BASELINE_DATASET_NAME,
  OPTIONAL_DATASET_FILES,
  REQUIRED_DATASET_FILES,
  USER_OVERRIDES_ROOT,
  buildEffectiveDatasetDigest,
  getCurrentOverrideSummary,
  getEffectiveDatasetFilePath,
  getEffectiveDatasetFiles,
  getUserOverrideDir,
  isAllowedDatasetFilename,
  resetUserOverrides,
  validateDatasetCompleteness,
  ensureDir,
};
