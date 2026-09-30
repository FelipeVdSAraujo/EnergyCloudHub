// server/routes/ukraine/shared.js
//
// Shared constants, validation and materialization helpers for the Ukraine
// FBMC model routes (plan tasks 2.1-2.3, decisions D4/D6/D7, section 6).
//
// Server-side truth for every user knob:
//   - scenario whitelist: PyPSA-Ukraine/networks/manifest.json (tracked in
//     git, so it is present on the Linux server too; the .nc files exist
//     only on the Windows compute box — file existence is checked there)
//   - window: hour-precision "YYYY-MM-DD HH:MM:SS" timestamps inside the
//     2023 network year, at most WINDOW_MAX_DAYS long (D6)
//   - GSK / base-case strategies: the enum NAMES accepted by the shipped
//     fbmc configs (src/fbmc/enums.py); web users get the proven subset
//   - VOLL: positive, bounded
//
// Config docs (Mongo "Config", model "ukraine") store the plain values
// object below; the run yaml is materialized from
// PyPSA-Ukraine/config/web_template.yaml at run time.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import yaml from "yaml";
import { fileURLToPath } from "url";
import { resolveRepoPath } from "../../utils/paths.js";

const MODEL_KEY = "ukraine";
const DISPLAY_NAME = "PyPSA Ukraine FBMC";

// Path resolution (this is the first model that lives ONLY inside the
// website_clone checkout — the four older models exist at both the
// workspace root and inside the clone, so plain resolveRepoPath works for
// them everywhere). Candidates:
//   1. UKRAINE_PACKAGE_ROOT env override (explicit wins)
//   2. resolveRepoPath("PyPSA-Ukraine") — production container mounts the
//      website_clone checkout at /workspace (ENSOLVE_ROOT=/workspace)
//   3. clone-relative — bare dev runs on a compute box where the repo root
//      is the PARENT of the checkout (server/routes/ukraine -> website_clone)
const ROUTE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_CLONE_ROOT = path.resolve(ROUTE_DIR, "..", "..", "..");

function resolvePackageRoot() {
  const candidates = [
    process.env.UKRAINE_PACKAGE_ROOT,
    resolveRepoPath("PyPSA-Ukraine"),
    path.join(WEBSITE_CLONE_ROOT, "PyPSA-Ukraine"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  // Conventional fallback so error messages point at the expected location.
  return path.resolve(resolveRepoPath("PyPSA-Ukraine"));
}

const PACKAGE_ROOT = resolvePackageRoot();

// Resolve a repo file that lives in the git checkout (same candidate
// logic: configured repo root first, clone-relative second).
function resolveRepoFile(...segments) {
  const candidates = [resolveRepoPath(...segments), path.join(WEBSITE_CLONE_ROOT, ...segments)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

const TEMPLATE_FILE = path.join(PACKAGE_ROOT, "config", "web_template.yaml");
const MANIFEST_FILE = path.join(PACKAGE_ROOT, "networks", "manifest.json");
const RUNS_ROOT = path.join(PACKAGE_ROOT, "results", "web_runs");
const WORK_ROOT = path.join(RUNS_ROOT, "_work");

const SECURITY_MODES = ["off", "on"];
const GSK_STRATEGIES = [
  "P_NOM",
  "BUS_P",
  "MERIT_ORDER",
  "ADJUSTABLE_CAP",
  "CURRENT_GENERATION",
  "ITERATIVE_UNCERTAINTY",
  "ITERATIVE_FBMC",
];
const BASE_CASE_STRATEGIES = ["ZERO_FLOWS", "NODAL_OPTIMUM"];

const VOLL_MIN = 1;
const VOLL_MAX = 100000;
const VOLL_DEFAULT = 5000;

const WINDOW_MAX_DAYS = 7;
const NETWORK_FIRST = "2023-01-01 00:00:00";
const NETWORK_LAST = "2023-12-31 23:00:00";
const HOUR_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:00:00$/;

// Reliability margin factor (RMF) on the CNEC flow limits — Wouter's UA
// production pairing, ADOPTED by user decision 2026-09-21 (plan 4.3.5):
// security on (N-1) -> 0.1, security off (N-0) -> 0.5. Derived server-side,
// not a user knob; folded into the run signature so this results-affecting
// methodology change invalidates stale duplicate-run matches.
const RMF_SECURITY_ON = 0.1;
const RMF_SECURITY_OFF = 0.5;

function deriveReliabilityMarginFactor(security) {
  return security === "on" ? RMF_SECURITY_ON : RMF_SECURITY_OFF;
}

// Default window = the validation reference day (plan rule 7).
const DEFAULT_VALUES = {
  scenario: "red",
  window_start: "2023-01-15 00:00:00",
  window_end: "2023-01-15 23:00:00",
  security: "off",
  gsk_strategy: "P_NOM",
  base_case_strategy: "ZERO_FLOWS",
  voll: VOLL_DEFAULT,
};

const VALUE_KEYS = Object.keys(DEFAULT_VALUES);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getScenarioCatalog() {
  let manifest;
  try {
    manifest = readJson(MANIFEST_FILE);
  } catch (err) {
    throw new Error(`Network manifest not readable (${MANIFEST_FILE}): ${err.message}`);
  }
  const scenarios = manifest?.scenarios;
  if (!scenarios || typeof scenarios !== "object") {
    throw new Error(`Network manifest has no 'scenarios' mapping (${MANIFEST_FILE})`);
  }
  return Object.entries(scenarios).map(([key, entry]) => ({
    key,
    label: entry?.label || key,
    file: entry?.file || null,
    case: entry?.case || key,
    size_bytes: Number(entry?.size_bytes) || null,
    sha256: entry?.sha256 || null,
  }));
}

function getScenarioEntry(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return null;
  return getScenarioCatalog().find((scenario) => scenario.key === normalized) || null;
}

function readTemplate() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(`Web config template not found: ${TEMPLATE_FILE}`);
  }
  return fs.readFileSync(TEMPLATE_FILE, "utf8");
}

function timestampMs(value, label, errors) {
  const raw = String(value ?? "").trim();
  if (!HOUR_TIMESTAMP.test(raw)) {
    errors.push({
      code: `${label}-format`,
      message: `${label} must be an hour-precision timestamp "YYYY-MM-DD HH:MM:SS" with minutes and seconds at :00:00 (got ${JSON.stringify(value)}).`,
    });
    return null;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    errors.push({
      code: `${label}-invalid-date`,
      message: `${label} is not a real calendar date (got ${JSON.stringify(value)}).`,
    });
    return null;
  }
  // Reject rolled-over impossible dates (e.g. 2023-02-30, which JavaScript
  // silently parses as March 2): re-render the parsed date at hour precision
  // and require it to round-trip exactly.
  const parsed = new Date(ms);
  const roundTrip = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")} ${String(parsed.getHours()).padStart(2, "0")}:00:00`;
  if (roundTrip !== raw) {
    errors.push({
      code: `${label}-invalid-date`,
      message: `${label} is not a real calendar date (got ${JSON.stringify(value)}).`,
    });
    return null;
  }
  return ms;
}

// Validates a raw values object (missing keys are filled from defaults).
// Returns { values (merged), normalized (or null on errors), errors, warnings }.
function validateValues(rawValues = {}) {
  const errors = [];
  const warnings = [];
  const values = rawValues && typeof rawValues === "object" ? rawValues : {};

  const unknownKeys = Object.keys(values).filter((key) => !VALUE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    warnings.push({
      code: "unknown-keys",
      message: `Ignored unknown config keys: ${unknownKeys.join(", ")}`,
      details: unknownKeys,
    });
  }

  const merged = { ...DEFAULT_VALUES, ...values };

  // Scenario (D7: dropdown, whitelist from the manifest)
  let scenario = null;
  if (!merged.scenario) {
    errors.push({ code: "scenario-missing", message: "scenario is required" });
  } else {
    scenario = getScenarioEntry(merged.scenario);
    if (!scenario) {
      const known = getScenarioCatalog().map((entry) => entry.key).join(", ");
      errors.push({
        code: "scenario-unknown",
        message: `Unknown scenario "${merged.scenario}". Known scenarios: ${known}`,
      });
    } else if (!scenario.file) {
      errors.push({
        code: "scenario-incomplete",
        message: `Manifest entry "${scenario.key}" has no network file.`,
      });
    }
  }

  // Window (rule 8: hour precision; D6: one-week cap; data = 2023)
  const startMs = timestampMs(merged.window_start, "window_start", errors);
  const endMs = timestampMs(merged.window_end, "window_end", errors);
  if (startMs !== null && endMs !== null) {
    if (endMs <= startMs) {
      errors.push({
        code: "window-empty",
        message: `window_end must be at least one hour after window_start (got ${merged.window_start} .. ${merged.window_end}).`,
      });
    } else if (endMs - startMs > WINDOW_MAX_DAYS * 24 * 3600 * 1000) {
      errors.push({
        code: "window-too-long",
        message: `Window exceeds the ${WINDOW_MAX_DAYS}-day web cap (D6): ${merged.window_start} .. ${merged.window_end}.`,
      });
    }
    const firstMs = Date.parse(NETWORK_FIRST);
    const lastMs = Date.parse(NETWORK_LAST);
    if (startMs < firstMs || endMs > lastMs) {
      errors.push({
        code: "window-outside-data",
        message: `Window must lie within the network's 2023 snapshots (${NETWORK_FIRST} .. ${NETWORK_LAST}); got ${merged.window_start} .. ${merged.window_end}.`,
      });
    }
  }

  // Security / strategies (subset of the fbmc enums proven on this box)
  if (!SECURITY_MODES.includes(merged.security)) {
    errors.push({
      code: "security-invalid",
      message: `security must be one of: ${SECURITY_MODES.join(", ")} (got ${JSON.stringify(merged.security)}).`,
    });
  }
  if (!GSK_STRATEGIES.includes(merged.gsk_strategy)) {
    errors.push({
      code: "gsk-strategy-invalid",
      message: `gsk_strategy must be one of: ${GSK_STRATEGIES.join(", ")} (got ${JSON.stringify(merged.gsk_strategy)}).`,
    });
  }
  if (!BASE_CASE_STRATEGIES.includes(merged.base_case_strategy)) {
    errors.push({
      code: "base-case-strategy-invalid",
      message: `base_case_strategy must be one of: ${BASE_CASE_STRATEGIES.join(", ")} (got ${JSON.stringify(merged.base_case_strategy)}).`,
    });
  }

  // VOLL
  const vollNumber = typeof merged.voll === "number" ? merged.voll : Number(merged.voll);
  if (!Number.isFinite(vollNumber) || vollNumber < VOLL_MIN || vollNumber > VOLL_MAX) {
    errors.push({
      code: "voll-range",
      message: `voll (value of lost load) must be a number between ${VOLL_MIN} and ${VOLL_MAX} EUR/MWh (got ${JSON.stringify(merged.voll)}).`,
    });
  }

  const normalized = errors.length
    ? null
    : {
        scenario: scenario.key,
        window_start: merged.window_start,
        window_end: merged.window_end,
        security: merged.security,
        gsk_strategy: merged.gsk_strategy,
        base_case_strategy: merged.base_case_strategy,
        voll: vollNumber,
      };

  return { values: merged, normalized, errors, warnings };
}

// Substitutes every <placeholder> in config/web_template.yaml (D4).
function materializeRunYaml({ values, scenario, outputsDir }) {
  const replacements = {
    case: scenario.case,
    network: scenario.file,
    window_start: values.window_start,
    window_end: values.window_end,
    security: values.security,
    rmf: String(deriveReliabilityMarginFactor(values.security)),
    gsk_strategy: values.gsk_strategy,
    base_case_strategy: values.base_case_strategy,
    voll: String(values.voll),
    outputs_dir: outputsDir,
  };

  let text = readTemplate();
  for (const [key, value] of Object.entries(replacements)) {
    text = text.split(`<${key}>`).join(String(value));
  }

  // Safety net: no placeholder may survive in NON-COMMENT lines (the
  // template's header comments legitimately reference <run_id> etc.).
  const significantText = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const leftovers = significantText.match(/<[a-z_]+>/g);
  if (leftovers) {
    throw new Error(`Template placeholders not resolved: ${[...new Set(leftovers)].join(", ")}`);
  }

  yaml.parse(text); // sanity: the materialized text must be valid yaml
  return text;
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeForHash(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Duplicate-run detection (same shape as the EMPIRE runner): includes the
// manifest's network sha256 so a swapped network backup forces a re-run.
function buildRunSignature({ scenario, values }) {
  const payload = {
    modelKey: MODEL_KEY,
    scenario: {
      key: scenario.key,
      file: scenario.file,
      sha256: scenario.sha256,
    },
    config: normalizeForHash({
      ...values,
      // Derived (plan 4.3.5), not user-set: included so the RMF pairing is
      // part of the identity of a run — old 0.0-margin runs can never be
      // matched as "identical" to post-pairing requests.
      reliability_margin_factor: deriveReliabilityMarginFactor(values.security),
    }),
  };
  return sha256Text(JSON.stringify(payload));
}

function sanitizeRunName(runName) {
  return (
    String(runName || "ukraine-run")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "ukraine-run"
  );
}

function getOptionsMetadata() {
  return {
    security_modes: [...SECURITY_MODES],
    gsk_strategies: [...GSK_STRATEGIES],
    base_case_strategies: [...BASE_CASE_STRATEGIES],
    voll: { min: VOLL_MIN, max: VOLL_MAX, default: VOLL_DEFAULT, unit: "EUR/MWh" },
  };
}

function getConstraints() {
  return {
    window_max_days: WINDOW_MAX_DAYS,
    network_first: NETWORK_FIRST,
    network_last: NETWORK_LAST,
    timestamp_format: "YYYY-MM-DD HH:MM:SS (hour precision; minutes and seconds must be :00:00)",
  };
}

export {
  MODEL_KEY,
  DISPLAY_NAME,
  PACKAGE_ROOT,
  TEMPLATE_FILE,
  RUNS_ROOT,
  WORK_ROOT,
  DEFAULT_VALUES,
  VALUE_KEYS,
  ensureDir,
  getScenarioCatalog,
  getScenarioEntry,
  validateValues,
  materializeRunYaml,
  buildRunSignature,
  sanitizeRunName,
  getOptionsMetadata,
  getConstraints,
  resolveRepoFile,
};



