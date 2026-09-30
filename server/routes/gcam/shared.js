import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveRepoPath } from "../../utils/paths.js";

const MODEL_KEY = "gcam";
const ROUTE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_FILE = path.join(ROUTE_DIR, "defaultConfig.json");
const ACTIVE_CONFIG_FILE = path.join(ROUTE_DIR, "activeConfig.json");
const GCAM_RUN_ROOT = resolveRepoPath("website_clone", "server", "data", "gcam_runs");

function ensureActiveConfigFile() {
  if (!fs.existsSync(ACTIVE_CONFIG_FILE)) {
    fs.copyFileSync(DEFAULT_CONFIG_FILE, ACTIVE_CONFIG_FILE);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function getDefaultConfig() {
  return readJson(DEFAULT_CONFIG_FILE);
}

function getActiveConfig() {
  ensureActiveConfigFile();
  return readJson(ACTIVE_CONFIG_FILE);
}

function saveActiveConfig(config) {
  ensureActiveConfigFile();
  writeJson(ACTIVE_CONFIG_FILE, config);
}

function resetActiveConfig() {
  fs.copyFileSync(DEFAULT_CONFIG_FILE, ACTIVE_CONFIG_FILE);
  return getActiveConfig();
}

function sanitizeRunName(runName) {
  return String(runName || "gcam-run")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "gcam-run";
}

export {
  ACTIVE_CONFIG_FILE,
  GCAM_RUN_ROOT,
  MODEL_KEY,
  ensureDir,
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  sanitizeRunName,
  saveActiveConfig,
  writeJson,
};
