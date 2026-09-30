import express from "express";
import {
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  saveActiveConfig,
} from "./shared.js";

const router = express.Router();

function normalizePathLike(value, fallback) {
  const v = String(value || "").trim();
  return v || fallback;
}

function normalizeConfig(input = {}) {
  const defaults = getDefaultConfig();
  const next = { ...defaults, ...(input || {}) };

  next.gcamHome = normalizePathLike(next.gcamHome, defaults.gcamHome);
  next.configurationFile = normalizePathLike(next.configurationFile, defaults.configurationFile);
  next.scenarioName = normalizePathLike(next.scenarioName, defaults.scenarioName);
  next.batchFileName = normalizePathLike(next.batchFileName, defaults.batchFileName);
  next.notes = String(next.notes || defaults.notes || "").trim();

  next.useBatchMode = Boolean(next.useBatchMode);
  next.createCostCurve = Boolean(next.createCostCurve);
  next.findPath = Boolean(next.findPath);

  const stopPeriod = Number(next.stopPeriod);
  next.stopPeriod = Number.isFinite(stopPeriod) ? Math.round(stopPeriod) : Number(defaults.stopPeriod ?? -1);

  return next;
}

router.get("/", (req, res) => {
  try {
    res.json(getActiveConfig());
  } catch (error) {
    res.status(500).json({ error: "Failed to read GCAM config", details: error.message });
  }
});

router.put("/", (req, res) => {
  try {
    const normalized = normalizeConfig(req.body || {});
    saveActiveConfig(normalized);
    res.json({ message: "GCAM config updated", config: normalized });
  } catch (error) {
    res.status(500).json({ error: "Failed to save GCAM config", details: error.message });
  }
});

router.post("/reset", (req, res) => {
  try {
    const config = resetActiveConfig();
    res.json({ message: "GCAM config reset", config });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset GCAM config", details: error.message });
  }
});

export default router;
