import express from "express";
import {
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  saveActiveConfig,
} from "./shared.js";

const router = express.Router();

const ALLOWED_OPTIMIZERS = new Set(["Gurobi.Optimizer", "HiGHS.Optimizer"]);

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function toNonNegativeFloat(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeConstraints(input, defaults) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = {};
  for (const key of Object.keys(defaults)) {
    normalized[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? Boolean(source[key])
      : Boolean(defaults[key]);
  }
  return normalized;
}

function normalizeConfig(input = {}) {
  const defaults = getDefaultConfig();
  const next = { ...defaults, ...(input || {}) };

  next.yInit = toPositiveInt(next.yInit, defaults.yInit);
  next.horizonYears = toPositiveInt(next.horizonYears, defaults.horizonYears);
  next.preYears = toPositiveInt(next.preYears, defaults.preYears);

  next.discountRate = toNonNegativeFloat(next.discountRate, defaults.discountRate);
  next.gamma = toNonNegativeFloat(next.gamma, defaults.gamma);
  next.budgetPenaltyPlus = toNonNegativeFloat(next.budgetPenaltyPlus, defaults.budgetPenaltyPlus);
  next.budgetPenaltyMinus = toNonNegativeFloat(next.budgetPenaltyMinus, defaults.budgetPenaltyMinus);

  next.alphaF = toNonNegativeFloat(next.alphaF, defaults.alphaF);
  next.betaF = toNonNegativeFloat(next.betaF, defaults.betaF);
  next.alphaH = toNonNegativeFloat(next.alphaH, defaults.alphaH);
  next.betaH = toNonNegativeFloat(next.betaH, defaults.betaH);

  if (!ALLOWED_OPTIMIZERS.has(next.optimizer)) {
    next.optimizer = defaults.optimizer;
  }

  next.constraints = normalizeConstraints(next.constraints, defaults.constraints);

  const solverDefaults = defaults.solverOptions || {};
  const solverInput = next.solverOptions && typeof next.solverOptions === "object" ? next.solverOptions : {};
  next.solverOptions = {
    mipGap: toNonNegativeFloat(solverInput.mipGap, solverDefaults.mipGap ?? 1e-9),
    timeLimitSeconds: toNonNegativeFloat(solverInput.timeLimitSeconds, solverDefaults.timeLimitSeconds ?? 0),
    threads: toNonNegativeFloat(solverInput.threads, solverDefaults.threads ?? 0),
  };

  return next;
}

router.get("/", (req, res) => {
  try {
    res.json(getActiveConfig());
  } catch (error) {
    res.status(500).json({ error: "Failed to read TransComp config", details: error.message });
  }
});

router.put("/", (req, res) => {
  try {
    const normalized = normalizeConfig(req.body || {});
    saveActiveConfig(normalized);
    res.json({ message: "TransComp config updated", config: normalized });
  } catch (error) {
    res.status(500).json({ error: "Failed to save TransComp config", details: error.message });
  }
});

router.post("/reset", (req, res) => {
  try {
    const config = resetActiveConfig();
    res.json({ message: "TransComp config reset", config });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset TransComp config", details: error.message });
  }
});

export default router;
