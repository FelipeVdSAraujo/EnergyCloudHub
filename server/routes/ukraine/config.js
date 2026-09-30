// server/routes/ukraine/config.js
//
// Per-user config docs for the Ukraine FBMC model (plan task 2.1, decision
// D4/D7). Mirrors routes/empire/config.js with these differences:
//   - Config content is the plain knob-values object (scenario, window_*,
//     security, gsk_strategy, base_case_strategy, voll), NOT a full yaml;
//     the run yaml is materialized from web_template.yaml at run time.
//   - Every query is scoped to model "ukraine", and selection changes only
//     deselect OTHER UKRAINE configs of the same user (the older routes
//     deselect across models; keeping this route scoped is additive-safe).
//   - GET / also returns the form metadata: scenario catalog (manifest),
//     whitelists, VOLL bounds and window constraints, so the client never
//     hardcodes them.

import express from "express";
import Config from "../../models/Config.js";
import {
  MODEL_KEY,
  DEFAULT_VALUES,
  getScenarioCatalog,
  getOptionsMetadata,
  getConstraints,
  validateValues,
} from "./shared.js";

const router = express.Router();

function normalizeBaseFilename(value) {
  return (
    String(value || "")
      .trim()
      .replace(/\.ya?ml$/i, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "User_Defined"
  );
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

async function resolveSelectedConfig(userId) {
  return Config.findOne({ owner: userId, model: MODEL_KEY, isSelected: true }).sort({ updatedAt: -1 });
}

async function resolveCurrentConfigSelection(userId, username) {
  const selectedConfig = await resolveSelectedConfig(userId);
  if (selectedConfig) {
    return {
      displayName: toDisplayName(selectedConfig.filename, username),
      source: "saved",
      configId: selectedConfig._id,
      filename: selectedConfig.filename,
    };
  }

  return {
    displayName: "Web_Template",
    source: "default",
    configId: null,
    filename: "web_template.yaml",
  };
}

async function resolveEffectiveConfig(userId) {
  const selectedConfig = await resolveSelectedConfig(userId);
  if (selectedConfig?.content && typeof selectedConfig.content === "object") {
    return { values: { ...DEFAULT_VALUES, ...selectedConfig.content }, source: "saved" };
  }
  return { values: { ...DEFAULT_VALUES }, source: "default" };
}

// GET / — effective config + all form metadata (scenario catalog etc.)
router.get("/", async (req, res) => {
  try {
    const { values, source } = await resolveEffectiveConfig(req.user.id);
    const selected = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    const validation = validateValues(values);
    const scenarios = getScenarioCatalog().map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      case: scenario.case,
      size_bytes: scenario.size_bytes,
    }));

    return res.json({
      values,
      defaults: DEFAULT_VALUES,
      selected,
      source,
      options: {
        scenarios,
        ...getOptionsMetadata(),
      },
      constraints: getConstraints(),
      validation: { errors: validation.errors, warnings: validation.warnings },
      template: "PyPSA-Ukraine/config/web_template.yaml",
    });
  } catch (err) {
    console.error("[ukraine] Failed to read config:", err.message);
    return res.status(500).json({ error: "Failed to read config", details: err.message });
  }
});

router.get("/current", async (req, res) => {
  try {
    const selection = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    return res.json(selection);
  } catch (err) {
    return res.status(500).json({ error: "Failed to resolve current config", details: err.message });
  }
});

router.get("/validate", async (req, res) => {
  try {
    const { values } = await resolveEffectiveConfig(req.user.id);
    const validation = validateValues(values);
    return res.json(validation);
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate config", details: err.message });
  }
});

router.post("/validate", (req, res) => {
  try {
    const configContent = req.body?.content ?? req.body ?? {};
    const validation = validateValues(configContent);
    return res.json(validation);
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate config", details: err.message });
  }
});

// PUT / — validate then upsert + select the user's Ukraine config doc.
// Content = knob values object (validated; missing keys filled from the
// defaults so stored docs stay self-contained).
router.put("/", async (req, res) => {
  try {
    const { fileName, content, mimeType } = req.body;
    const configContent = content ?? req.body;
    const userId = req.user.id;

    const validation = validateValues(configContent || {});
    if (!validation.normalized) {
      return res.status(400).json({
        error: "Config validation failed",
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const finalBaseName = normalizeBaseFilename(fileName);
    const finalFileName = `${req.user.username}_${finalBaseName}.yaml`;
    const storedValues = validation.values; // merged with defaults
    const size = Buffer.byteLength(JSON.stringify(storedValues), "utf8");

    const configDoc = await Config.findOneAndUpdate(
      {
        owner: userId,
        filename: finalFileName,
        model: MODEL_KEY,
      },
      {
        owner: userId,
        filename: finalFileName,
        mimeType: mimeType || "application/x-yaml",
        model: MODEL_KEY,
        content: storedValues,
        size,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // Deselect only this model's other configs (additive-safe, rule 9).
    await Config.updateMany(
      { owner: userId, model: MODEL_KEY, _id: { $ne: configDoc._id } },
      { $set: { isSelected: false } }
    );
    await Config.findByIdAndUpdate(configDoc._id, { $set: { isSelected: true } });

    const selection = await resolveCurrentConfigSelection(req.user.id, req.user.username);
    return res.json({
      message: "Config updated",
      filename: finalFileName,
      configId: configDoc._id,
      displayName: selection.displayName,
      validation: { warnings: validation.warnings },
    });
  } catch (err) {
    console.error("[ukraine] Failed to write config:", err.message);
    return res.status(500).json({ error: "Failed to write config", details: err.message });
  }
});

router.post("/select", async (req, res) => {
  try {
    const { configId } = req.body || {};
    if (!configId) {
      return res.status(400).json({ error: "configId is required" });
    }

    const configDoc = await Config.findOne({ _id: configId, owner: req.user.id, model: MODEL_KEY });
    if (!configDoc) {
      return res.status(404).json({ error: "Selected config not found" });
    }

    await Config.updateMany({ owner: req.user.id, model: MODEL_KEY }, { $set: { isSelected: false } });
    await Config.findByIdAndUpdate(configDoc._id, { $set: { isSelected: true } });

    return res.json({
      message: "Config selected",
      configId: configDoc._id,
      filename: configDoc.filename,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to select config", details: err.message });
  }
});

router.get("/user_configs", async (req, res) => {
  try {
    const configs = await Config.find({ owner: req.user.id, model: MODEL_KEY }).sort({ createdAt: -1 });
    return res.json({ configs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch configs", details: err.message });
  }
});

router.post("/reset", (req, res) => {
  Config.updateMany({ owner: req.user.id, model: MODEL_KEY }, { $set: { isSelected: false } })
    .then(() => {
      res.json({ message: "Config selection reset to default template (web_template.yaml)" });
    })
    .catch((err) => {
      res.status(500).json({ error: "Failed to reset config", details: err.message });
    });
});

export default router;


