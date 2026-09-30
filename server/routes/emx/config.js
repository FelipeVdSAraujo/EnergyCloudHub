import express from "express";
import {
  getCountryOptions,
  getActiveConfig,
  getDefaultConfig,
  resetActiveConfig,
  saveActiveConfig
} from "./shared.js";

const router = express.Router();

const OUTPUT_VARIABLE_OPTIONS = [
  "flow_out",
  "flow_in",
  "cap_use",
  "emissions_total",
  "emissions_node",
  "curtailment",
  "sink_deficit",
  "sink_surplus",
  "trans_in",
  "trans_out",
  "trans_loss",
  "stor_charge_use",
  "stor_discharge_use",
  "stor_level",
  "hydro_spill"
];

const OUTPUT_VARIABLE_DEFAULTS = ["flow_out", "emissions_node", "trans_in", "trans_out"];
const RES_OPEX_TECH_OPTIONS = [
  "electricitySolarPvUtilityOptimal",
  "electricityWindOnshoreAverage",
  "electricityWindOffshoreTransitional",
  "electricityHydroRunOfRiver",
  "heatSolar"
];

const RES_OPEX_DEFAULTS = {
  electricitySolarPvUtilityOptimal: 0.0036,
  electricityWindOnshoreAverage: 0.18,
  electricityWindOffshoreTransitional: 0.39312,
  electricityHydroRunOfRiver: 0.0036,
  heatSolar: 0.0036
};

function buildCountrySelectionDefaults(countryOptions) {
  const defaults = {};
  for (const country of countryOptions) {
    defaults[country.code] = Boolean(country.defaultIncluded);
  }
  return defaults;
}

function hydrateConfig(config) {
  return {
    ...config,
    availableCountries: getCountryOptions(),
    outputVariableOptions: OUTPUT_VARIABLE_OPTIONS,
    resOpexTechOptions: RES_OPEX_TECH_OPTIONS
  };
}

function normalizeConfig(input = {}) {
  const defaults = getDefaultConfig();
  const next = { ...defaults, ...input };
  const countryOptions = getCountryOptions();
  const countryCodes = new Set(countryOptions.map((country) => country.code));
  const countryDefaults = buildCountrySelectionDefaults(countryOptions);

  const allowedCaseTypes = new Set(["case", "case_small"]);
  if (!allowedCaseTypes.has(next.caseType)) {
    next.caseType = defaults.caseType;
  }

  next.opPeriods = Number(next.opPeriods);
  next.opPeriodsDuration = Number(next.opPeriodsDuration);
  next.optimHor = Number(next.optimHor);
  next.implHor = Number(next.implHor);

  for (const key of ["opPeriods", "opPeriodsDuration", "optimHor", "implHor"]) {
    if (!Number.isFinite(next[key]) || next[key] <= 0) {
      next[key] = defaults[key];
    }
  }

  if (next.optimHor <= next.implHor) {
    next.optimHor = Math.max(next.implHor + 1, defaults.optimHor);
  }

  next.includeLithiumIon = Boolean(next.includeLithiumIon);
  next.includePumpedStorage = Boolean(next.includePumpedStorage);
  next.includeHydroReservoir = Boolean(next.includeHydroReservoir);
  next.generateDispatchPlot = Boolean(next.generateDispatchPlot);

  next.emissionPrice = Number(next.emissionPrice);
  if (!Number.isFinite(next.emissionPrice) || next.emissionPrice < 0) {
    next.emissionPrice = Number(defaults.emissionPrice ?? 30);
  }

  const incomingResOpex = next.resOpex || {};
  const normalizedResOpex = {};
  for (const key of RES_OPEX_TECH_OPTIONS) {
    const value = Number(incomingResOpex[key]);
    if (Number.isFinite(value) && value >= 0) {
      normalizedResOpex[key] = value;
    } else {
      normalizedResOpex[key] = Number(
        (defaults.resOpex && defaults.resOpex[key] !== undefined)
          ? defaults.resOpex[key]
          : RES_OPEX_DEFAULTS[key]
      );
    }
  }
  next.resOpex = normalizedResOpex;

  const selectedCountries = {};
  const incomingCountries = next.selectedCountries || {};
  for (const code of countryCodes) {
    selectedCountries[code] =
      typeof incomingCountries[code] === "boolean" ? incomingCountries[code] : countryDefaults[code];
  }

  const selectedOutputVariablesRaw = Array.isArray(next.selectedOutputVariables)
    ? next.selectedOutputVariables
    : OUTPUT_VARIABLE_DEFAULTS;
  const selectedOutputVariables = selectedOutputVariablesRaw
    .map((value) => String(value))
    .filter((value, index, arr) => OUTPUT_VARIABLE_OPTIONS.includes(value) && arr.indexOf(value) === index);

  next.selectedCountries = selectedCountries;
  next.selectedOutputVariables =
    selectedOutputVariables.length > 0 ? selectedOutputVariables : OUTPUT_VARIABLE_DEFAULTS;
  next.optimizer = "HiGHS.Optimizer";

  return next;
}

router.get("/", (req, res) => {
  try {
    const normalized = normalizeConfig(getActiveConfig());
    res.json(hydrateConfig(normalized));
  } catch (error) {
    res.status(500).json({ error: "Failed to read EMX config", details: error.message });
  }
});

router.put("/", (req, res) => {
  try {
    const normalized = normalizeConfig(req.body || {});
    saveActiveConfig(normalized);
    res.json({ message: "EMX config updated", config: hydrateConfig(normalized) });
  } catch (error) {
    res.status(500).json({ error: "Failed to save EMX config", details: error.message });
  }
});

router.post("/reset", (req, res) => {
  try {
    const config = normalizeConfig(resetActiveConfig());
    saveActiveConfig(config);
    res.json({ message: "EMX config reset", config: hydrateConfig(config) });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset EMX config", details: error.message });
  }
});

export default router;
