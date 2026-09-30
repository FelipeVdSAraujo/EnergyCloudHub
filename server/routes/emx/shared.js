import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { resolveRepoPath } from "../../utils/paths.js";

const MODEL_KEY = "emx";
const PROJECT_DIR = resolveRepoPath("EMX", "emx-north-sea-case-jl");
const RESULTS_DIR = path.join(PROJECT_DIR, "results");
const ROUTE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_FILE = path.join(ROUTE_DIR, "defaultConfig.json");
const ACTIVE_CONFIG_FILE = path.join(ROUTE_DIR, "activeConfig.json");
const COUNTRY_OPTIONS_FILE = path.join(ROUTE_DIR, "country-options.yml");

const FALLBACK_COUNTRY_OPTIONS = [
  { code: "DE", name: "Germany", defaultIncluded: true },
  { code: "DK", name: "Denmark", defaultIncluded: true },
  { code: "NL", name: "Netherlands", defaultIncluded: true },
  { code: "NO", name: "Norway", defaultIncluded: true },
  { code: "UK", name: "Great Britain", defaultIncluded: true }
];

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

function getCountryOptions() {
  try {
    const raw = fs.readFileSync(COUNTRY_OPTIONS_FILE, "utf8");
    const parsed = YAML.parse(raw);
    const rows = Array.isArray(parsed?.countries) ? parsed.countries : [];

    const normalized = rows
      .map((row) => ({
        code: String(row?.code || "").trim().toUpperCase(),
        name: String(row?.name || "").trim(),
        defaultIncluded: Boolean(row?.defaultIncluded)
      }))
      .filter((row) => row.code && row.name);

    return normalized.length > 0 ? normalized : FALLBACK_COUNTRY_OPTIONS;
  } catch (error) {
    return FALLBACK_COUNTRY_OPTIONS;
  }
}

function sanitizeRunName(runName) {
  return String(runName || "emx-run")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "emx-run";
}

export {
  ACTIVE_CONFIG_FILE,
  COUNTRY_OPTIONS_FILE,
  MODEL_KEY,
  PROJECT_DIR,
  RESULTS_DIR,
  getCountryOptions,
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  sanitizeRunName,
  saveActiveConfig,
  writeJson
};
