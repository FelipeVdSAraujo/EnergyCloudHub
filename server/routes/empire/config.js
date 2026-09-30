

import express from "express";
import fs from "fs";
import yaml from "yaml";
import Config from "../../models/Config.js";
import { resolveRepoPath } from "../../utils/paths.js";

const router = express.Router();

const SIMPLE_DEFAULT_FILE = resolveRepoPath("OpenEMPIRE", "config", "testrun.yaml");
const UPLOADS_SCENARIO_DIR = resolveRepoPath("OpenEMPIRE", "Data handler", "uploads", "ScenarioData");
const BASELINE_SCENARIO_DIR = resolveRepoPath("OpenEMPIRE", "Data handler", "europe_v51", "ScenarioData");

const REQUIRED_SCENARIO_CSVS = [
  "solar.csv",
  "windonshore.csv",
  "windoffshore.csv",
  "hydroror.csv",
  "hydroseasonal.csv",
  "electricload.csv",
];

const REQUIRED_STOCHASTIC_TABS = [
  "Stochastic_StochasticAvailability.tab",
  "Stochastic_ElectricLoadRaw.tab",
  "Stochastic_HydroGenMaxSeasonalProduction.tab",
];

function fileExists(path) {
  try {
    fs.accessSync(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readSamplingKeyHeader(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const firstLine = String(raw).split(/\r?\n/)[0] || "";
    return firstLine
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildConsistencyWarnings(configContent = {}) {
  const warnings = [];
  const useScenarioGeneration = Boolean(configContent.use_scenario_generation);
  const useFixedSample = Boolean(configContent.use_fixed_sample);

  if (useScenarioGeneration) {
    const missingCsv = REQUIRED_SCENARIO_CSVS.filter(
      (filename) => !fileExists(resolveRepoPath("OpenEMPIRE", "Data handler", "europe_v51", "ScenarioData", filename))
    );

    if (missingCsv.length > 0) {
      warnings.push({
        code: "missing-scenario-csv",
        severity: "warning",
        message:
          "time_series_generation is true, but required ScenarioData CSV files are missing from the baseline dataset (europe_v51/ScenarioData).",
        details: missingCsv,
      });
    }

    if (useFixedSample) {
      const samplingKeyPath = resolveRepoPath(
        "OpenEMPIRE",
        "Data handler",
        "europe_v51",
        "ScenarioData",
        "sampling_key.csv"
      );

      if (!fileExists(samplingKeyPath)) {
        warnings.push({
          code: "missing-sampling-key",
          severity: "warning",
          message:
            "use_fixed_sample is true, but sampling_key.csv was not found in the baseline dataset (europe_v51/ScenarioData).",
          details: ["sampling_key.csv"],
        });
      } else {
        const header = readSamplingKeyHeader(samplingKeyPath);
        const requiredColumns = ["Period", "Scenario", "Season", "Year", "Hour"];
        const missingColumns = requiredColumns.filter((column) => !header.includes(column));
        if (missingColumns.length > 0) {
          warnings.push({
            code: "invalid-sampling-key-header",
            severity: "warning",
            message: "sampling_key.csv is present but does not have the expected columns.",
            details: missingColumns,
          });
        }
      }
    }
  } else {
    const missingTabs = REQUIRED_STOCHASTIC_TABS.filter(
      (filename) => !fileExists(resolveRepoPath("OpenEMPIRE", "Data handler", "europe_v51", "ScenarioData", filename))
    );

    if (missingTabs.length > 0) {
      warnings.push({
        code: "missing-pre-generated-tabs",
        severity: "warning",
        message:
          "time_series_generation is false, but required pre-generated stochastic .tab files are missing from the baseline dataset (europe_v51/ScenarioData).",
        details: missingTabs,
      });
    }

    if (useFixedSample) {
      warnings.push({
        code: "fixed-sample-ignored",
        severity: "info",
        message:
          "use_fixed_sample only affects runs where time_series_generation is true. With generation off, EMPIRE uses existing stochastic .tab files.",
        details: [],
      });
    }
  }

  return warnings;
}

function normalizeBaseFilename(value) {
  return String(value || "")
    .trim()
    .replace(/\.ya?ml$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function toDisplayName(storedFilename, username) {
  if (!storedFilename) {
    return null;
  }
  const withoutExt = String(storedFilename).replace(/\.ya?ml$/i, "");
  const prefix = `${username}_`;
  if (withoutExt.startsWith(prefix)) {
    return withoutExt.slice(prefix.length);
  }
  return withoutExt;
}

async function resolveCurrentConfigSelection(userId, username) {
  const selectedConfig = await Config.findOne({ owner: userId, isSelected: true }).sort({ updatedAt: -1 });
  if (selectedConfig) {
    return {
      displayName: toDisplayName(selectedConfig.filename, username),
      source: "saved",
      configId: selectedConfig._id,
      filename: selectedConfig.filename,
    };
  }

  return {
    displayName: "Test_Run",
    source: "default",
    configId: null,
    filename: "testrun.yaml",
  };
}

function readDefaultConfig() {
  return yaml.parse(fs.readFileSync(SIMPLE_DEFAULT_FILE, "utf8"));
}

async function resolveEffectiveConfigForUser(userId) {
  const selectedConfig = await Config.findOne({ owner: userId, isSelected: true }).sort({ updatedAt: -1 });
  if (selectedConfig?.content && typeof selectedConfig.content === "object") {
    return selectedConfig.content;
  }
  return readDefaultConfig();
}


router.get('/', async (req, res) => {
  try {
    const config = await resolveEffectiveConfigForUser(req.user.id);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read config', details: err.message });
  }
});

router.get('/current', async (req, res) => {
  try {
    const selection = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    return res.json(selection);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve current config', details: err.message });
  }
});

router.get('/validate', async (req, res) => {
  try {
    const effectiveConfig = await resolveEffectiveConfigForUser(req.user.id);
    const warnings = buildConsistencyWarnings(effectiveConfig);
    return res.json({ warnings });
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate config", details: err.message });
  }
});

router.post('/validate', (req, res) => {
  try {
    const configContent = req.body?.content ?? req.body ?? {};
    const warnings = buildConsistencyWarnings(configContent);
    return res.json({ warnings });
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate config", details: err.message });
  }
});

router.put('/',async (req, res) => {
  try {
    const {ModelName, fileName, content, mimeType} = req.body
    const configContent = content ?? req.body;
    const modelName = ModelName || "empire";
    const userId = req.user.id;
    const cleanBaseName = normalizeBaseFilename(fileName);
    const finalBaseName = cleanBaseName || "User_Defined";
    const finalFileName = `${req.user.username}_${finalBaseName}.yaml`;
    const size = Buffer.byteLength(JSON.stringify(configContent), "utf8");

    const configDoc = await Config.findOneAndUpdate(
      {
        owner: userId,
        filename: finalFileName,
        model: modelName,
      },
      {
        owner: userId,
        filename: finalFileName,
        mimeType: mimeType,
        model: modelName,
        content: configContent,
        size: size,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await Config.updateMany({ owner: userId, _id: { $ne: configDoc._id } }, { $set: { isSelected: false } });
    await Config.findByIdAndUpdate(configDoc._id, { $set: { isSelected: true } });

    const selection = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    res.json({
      message: 'Config updated',
      filename: finalFileName,
      configId: configDoc._id,
      displayName: selection.displayName,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write config', details: err.message });
  }
});

router.post('/select', async (req, res) => {
  try {
    const { configId } = req.body || {};
    if (!configId) {
      return res.status(400).json({ error: 'configId is required' });
    }

    const configDoc = await Config.findOne({ _id: configId, owner: req.user.id });
    if (!configDoc) {
      return res.status(404).json({ error: 'Selected config not found' });
    }

    await Config.updateMany({ owner: req.user.id }, { $set: { isSelected: false } });
    await Config.findByIdAndUpdate(configDoc._id, { $set: { isSelected: true } });

    const selection = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    return res.json({
      message: 'Config selected',
      configId: configDoc._id,
      filename: configDoc.filename,
      displayName: selection.displayName,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to select config', details: err.message });
  }
});


router.get("/user_configs", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    
    const configs = await Config.find({ owner: userId })
      .sort({ createdAt: -1 });
    return res.json({ configs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch configs", details: err.message });
  }
});

router.post('/reset', (req, res) => {
  Config.updateMany({ owner: req.user.id }, { $set: { isSelected: false } })
  .then(() => {
    res.json({ message: 'Config selection reset to default template (testrun.yaml)' });
  })
  .catch((err) => {
    res.status(500).json({ error: 'Failed to reset config', details: err.message });
  });
});

export default router;
