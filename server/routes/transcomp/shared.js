import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveRepoPath } from "../../utils/paths.js";

const MODEL_KEY = "transcomp";
const ROUTE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_FILE = path.join(ROUTE_DIR, "defaultConfig.json");
const ACTIVE_CONFIG_FILE = path.join(ROUTE_DIR, "activeConfig.json");
const TRANS_COMP_ROOT = resolveRepoPath("TransCompModel");
const TRANS_COMP_DATA_ROOT = resolveRepoPath("TransCompModel", "data");
const TRANS_COMP_RUN_ROOT = resolveRepoPath("TransCompModel", "data", "web_runs");
const TRANS_COMP_INPUT_ROOT = resolveRepoPath("TransCompModel", "data", "web_runs", "_work");

function ensureActiveConfigFile() {
  if (!fs.existsSync(ACTIVE_CONFIG_FILE)) {
    fs.copyFileSync(DEFAULT_CONFIG_FILE, ACTIVE_CONFIG_FILE);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
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
  return String(runName || "transcomp-run")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "transcomp-run";
}

export {
  ACTIVE_CONFIG_FILE,
  MODEL_KEY,
  TRANS_COMP_DATA_ROOT,
  TRANS_COMP_INPUT_ROOT,
  TRANS_COMP_ROOT,
  TRANS_COMP_RUN_ROOT,
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  sanitizeRunName,
  saveActiveConfig,
  writeJson,
};
