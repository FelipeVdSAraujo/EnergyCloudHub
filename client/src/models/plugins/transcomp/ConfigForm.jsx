import React, { useEffect, useState } from "react";
import { getConfig, resetConfig, saveConfig } from "./api";

const DEFAULTS = {
  yInit: 2020,
  horizonYears: 31,
  preYears: 25,
  discountRate: 0.05,
  gamma: 0.0003,
  budgetPenaltyPlus: 1000,
  budgetPenaltyMinus: 100,
  alphaF: 0.1,
  betaF: 0.1,
  alphaH: 0.1,
  betaH: 0.1,
  optimizer: "Gurobi.Optimizer",
  constraints: {
    demandCoverage: true,
    vehicleSizing: true,
    vehicleAging: true,
    fuelingDemand: true,
    vehicleStockShift: true,
    modeShift: true,
    fuelingInfrastructure: true,
    modeInfrastructure: true,
    monetaryBudget: false,
    modeShareExact: false,
    modeShareMin: false,
    modeShareMax: false,
    marketShare: false,
    emissionsByMode: false,
    supplyInfrastructure: false,
  },
  solverOptions: {
    mipGap: 1e-9,
    timeLimitSeconds: 0,
    threads: 0,
  },
};

function NumberField({ label, value, onChange, step = "1", min = "0" }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border rounded px-3 py-2"
      />
    </div>
  );
}

export default function ConfigForm() {
  const [config, setConfig] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig()
      .then((data) => {
        setConfig({
          ...DEFAULTS,
          ...data,
          constraints: { ...DEFAULTS.constraints, ...(data?.constraints || {}) },
          solverOptions: { ...DEFAULTS.solverOptions, ...(data?.solverOptions || {}) },
        });
      })
      .catch((error) => {
        console.error(error);
        alert("Failed to load TransComp config");
      })
      .finally(() => setLoading(false));
  }, []);

  const setField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  const setConstraint = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      constraints: { ...prev.constraints, [key]: value },
    }));
  };

  const setSolverOption = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      solverOptions: { ...prev.solverOptions, [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveConfig(config);
      if (result?.config) {
        setConfig({
          ...DEFAULTS,
          ...result.config,
          constraints: { ...DEFAULTS.constraints, ...(result.config?.constraints || {}) },
          solverOptions: { ...DEFAULTS.solverOptions, ...(result.config?.solverOptions || {}) },
        });
      }
      alert("TransComp config saved");
    } catch (error) {
      console.error(error);
      alert("Failed to save TransComp config");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset TransComp config to defaults?")) return;
    try {
      const result = await resetConfig();
      setConfig({
        ...DEFAULTS,
        ...(result?.config || {}),
        constraints: { ...DEFAULTS.constraints, ...(result?.config?.constraints || {}) },
        solverOptions: { ...DEFAULTS.solverOptions, ...(result?.config?.solverOptions || {}) },
      });
    } catch (error) {
      console.error(error);
      alert("Failed to reset TransComp config");
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading TransComp config...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">TransComp Config</h2>
      <p className="text-sm text-gray-600 mb-6">
        Set model horizon, penalties, shift parameters, solver settings, and active constraint blocks.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-gray-50 border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Model Horizon</h3>
          <NumberField label="Initial year (y_init)" value={config.yInit} onChange={(v) => setField("yInit", v)} min="1900" />
          <NumberField label="Horizon years (Y)" value={config.horizonYears} onChange={(v) => setField("horizonYears", v)} min="1" />
          <NumberField label="Pre years (pre_y)" value={config.preYears} onChange={(v) => setField("preYears", v)} min="1" />
        </section>

        <section className="bg-gray-50 border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Core Parameters</h3>
          <NumberField label="Discount rate" value={config.discountRate} onChange={(v) => setField("discountRate", v)} step="0.001" />
          <NumberField label="Gamma" value={config.gamma} onChange={(v) => setField("gamma", v)} step="0.0001" />
          <NumberField label="Budget penalty plus" value={config.budgetPenaltyPlus} onChange={(v) => setField("budgetPenaltyPlus", v)} step="1" />
          <NumberField label="Budget penalty minus" value={config.budgetPenaltyMinus} onChange={(v) => setField("budgetPenaltyMinus", v)} step="1" />
        </section>
      </div>

      <section className="bg-gray-50 border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-3">Shift Parameters</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <NumberField label="alpha_f" value={config.alphaF} onChange={(v) => setField("alphaF", v)} step="0.01" />
          <NumberField label="beta_f" value={config.betaF} onChange={(v) => setField("betaF", v)} step="0.01" />
          <NumberField label="alpha_h" value={config.alphaH} onChange={(v) => setField("alphaH", v)} step="0.01" />
          <NumberField label="beta_h" value={config.betaH} onChange={(v) => setField("betaH", v)} step="0.01" />
        </div>
      </section>

      <section className="bg-gray-50 border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-3">Solver</h3>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Optimizer</label>
          <select
            value={config.optimizer}
            onChange={(e) => setField("optimizer", e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="Gurobi.Optimizer">Gurobi.Optimizer</option>
            <option value="HiGHS.Optimizer">HiGHS.Optimizer</option>
          </select>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <NumberField label="MIP Gap" value={config.solverOptions?.mipGap ?? 0} onChange={(v) => setSolverOption("mipGap", v)} step="0.000000001" />
          <NumberField label="Time limit (s)" value={config.solverOptions?.timeLimitSeconds ?? 0} onChange={(v) => setSolverOption("timeLimitSeconds", v)} step="1" />
          <NumberField label="Threads (0=auto)" value={config.solverOptions?.threads ?? 0} onChange={(v) => setSolverOption("threads", v)} step="1" />
        </div>
      </section>

      <section className="bg-gray-50 border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-3">Constraint Blocks</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(config.constraints || {}).map(([key, enabled]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(enabled)}
                onChange={(e) => setConstraint(key, e.target.checked)}
              />
              <span>{key}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Config"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
}
