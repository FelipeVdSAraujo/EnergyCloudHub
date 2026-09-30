import React, { useEffect, useState } from "react";
import { getConfig, resetConfig, saveConfig } from "./api";

const DEFAULTS = {
  opPeriods: 168,
  optimHor: 48,
  implHor: 24,
  optimizer: "HiGHS.Optimizer",
  generateDispatchPlot: true,
  emissionPrice: 30,
  resOpex: {
    electricitySolarPvUtilityOptimal: 0.0036,
    electricityWindOnshoreAverage: 0.18,
    electricityWindOffshoreTransitional: 0.39312,
    electricityHydroRunOfRiver: 0.0036,
    heatSolar: 0.0036,
  },
  selectedCountries: {
    DE: true,
    DK: true,
    NL: true,
    NO: true,
    UK: true,
  },
  selectedOutputVariables: ["flow_out", "emissions_node", "trans_in", "trans_out"],
  availableCountries: [
    { code: "DE", name: "Germany", defaultIncluded: true },
    { code: "DK", name: "Denmark", defaultIncluded: true },
    { code: "NL", name: "Netherlands", defaultIncluded: true },
    { code: "NO", name: "Norway", defaultIncluded: true },
    { code: "UK", name: "Great Britain", defaultIncluded: true },
  ],
  outputVariableOptions: [
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
    "hydro_spill",
  ],
};

function InfoTip({ text }) {
  return (
    <span className="relative inline-flex items-center group">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold cursor-help border border-yellow-500">
        i
      </span>
      <span className="absolute z-20 left-6 top-1/2 -translate-y-1/2 hidden group-hover:block w-80 p-3 text-xs text-gray-800 bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg">
        {text}
      </span>
    </span>
  );
}

function NumberField({ label, value, onChange, min = 1, help, info }) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 font-medium mb-1">
        <span>{label}</span>
        {info ? <InfoTip text={info} /> : null}
      </label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border rounded px-3 py-2"
      />
      {help ? <p className="text-sm text-gray-500 mt-1">{help}</p> : null}
    </div>
  );
}

export default function ConfigForm() {
  const [config, setConfig] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig()
      .then((data) => setConfig({ ...DEFAULTS, ...data }))
      .catch((error) => {
        console.error(error);
        alert("Failed to load EMX config");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleCountryToggle = (code, value) => {
    setConfig((prev) => ({
      ...prev,
      selectedCountries: {
        ...(prev.selectedCountries || {}),
        [code]: value,
      },
    }));
  };

  const handleOutputToggle = (name, enabled) => {
    setConfig((prev) => {
      const current = Array.isArray(prev.selectedOutputVariables)
        ? prev.selectedOutputVariables
        : [];

      const next = enabled
        ? [...new Set([...current, name])]
        : current.filter((entry) => entry !== name);

      return {
        ...prev,
        selectedOutputVariables: next,
      };
    });
  };

  const handleResOpexChange = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      resOpex: {
        ...(prev.resOpex || {}),
        [key]: Number(value),
      },
    }));
  };

  const setAllCountries = (enabled) => {
    const next = {};
    for (const country of config.availableCountries || []) {
      next[country.code] = enabled;
    }
    setConfig((prev) => ({
      ...prev,
      selectedCountries: next,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveConfig(config);
      if (result?.config) {
        setConfig({ ...DEFAULTS, ...result.config });
      }
      alert("EMX config saved");
    } catch (error) {
      console.error(error);
      alert("Failed to save EMX config");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset the EMX config to defaults?")) return;
    try {
      const result = await resetConfig();
      setConfig({ ...DEFAULTS, ...(result?.data?.config || result?.config || DEFAULTS) });
    } catch (error) {
      console.error(error);
      alert("Failed to reset EMX config");
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading EMX config...</div>;
  }

  const selectedCountriesCount = Object.values(config.selectedCountries || {}).filter(Boolean).length;
  const selectedOutputCount = Array.isArray(config.selectedOutputVariables)
    ? config.selectedOutputVariables.length
    : 0;

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">EMX Config</h2>
      <p className="text-sm text-gray-600 mb-6">
        Configure time horizon, country inclusion, and result exports for EMX website runs.
      </p>

      <section className="bg-gray-50 border rounded-xl p-4">
          <h3 className="font-semibold mb-4">Time Horizon</h3>
          <div className="grid md:grid-cols-2 gap-x-6">
          <NumberField
            label="Operational periods"
            value={config.opPeriods}
            onChange={(value) => handleChange("opPeriods", value)}
            info="The smallest time unit modelled, typically representing individual hours."
          />
          <NumberField
            label="Optimization horizon"
            value={config.optimHor}
            onChange={(value) => handleChange("optimHor", value)}
            info="The full time window solved by the optimizer. It is always larger than the implementation horizon, as it looks further ahead to inform current decisions."
          />
          <NumberField
            label="Implementation horizon"
            value={config.implHor}
            onChange={(value) => handleChange("implHor", value)}
            info="Only this window is retained from each solve before the horizon rolls forward."
          />
          </div>
      </section>

      <section className="bg-gray-50 border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-4">Economic Settings</h3>
        <div className="grid md:grid-cols-2 gap-x-6">
          <NumberField
            label="Carbon Emission Price (CO2)"
            value={config.emissionPrice}
            min={0}
            onChange={(value) => handleChange("emissionPrice", value)}
          />
          <NumberField
            label="OPEX: Electricity Solar PV Utility Optimal"
            value={config.resOpex?.electricitySolarPvUtilityOptimal ?? 0.0036}
            min={0}
            onChange={(value) => handleResOpexChange("electricitySolarPvUtilityOptimal", value)}
          />
          <NumberField
            label="OPEX: Electricity Wind Onshore Average"
            value={config.resOpex?.electricityWindOnshoreAverage ?? 0.18}
            min={0}
            onChange={(value) => handleResOpexChange("electricityWindOnshoreAverage", value)}
          />
          <NumberField
            label="OPEX: Electricity Wind Offshore Transitional"
            value={config.resOpex?.electricityWindOffshoreTransitional ?? 0.39312}
            min={0}
            onChange={(value) => handleResOpexChange("electricityWindOffshoreTransitional", value)}
          />
          <NumberField
            label="OPEX: Electricity Hydro Run of River"
            value={config.resOpex?.electricityHydroRunOfRiver ?? 0.0036}
            min={0}
            onChange={(value) => handleResOpexChange("electricityHydroRunOfRiver", value)}
          />
          <NumberField
            label="OPEX: Heat Solar"
            value={config.resOpex?.heatSolar ?? 0.0036}
            min={0}
            onChange={(value) => handleResOpexChange("heatSolar", value)}
          />
        </div>
      </section>

      <section className="bg-white border rounded-xl p-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Country Selection</h3>
          <span className="text-sm text-gray-600">Selected: {selectedCountriesCount}</span>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Enable or disable countries included in the optimization. Country options are loaded from
          website YAML configuration.
        </p>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setAllCountries(true)}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => setAllCountries(false)}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
          >
            Clear All
          </button>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {(config.availableCountries || []).map((country) => (
            <label
              key={country.code}
              className="flex items-start gap-2 p-3 border rounded-lg bg-gray-50"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(config.selectedCountries?.[country.code])}
                onChange={(e) => handleCountryToggle(country.code, e.target.checked)}
              />
              <span>
                <span className="block font-medium">{country.name}</span>
                <span className="block text-xs text-gray-500">{country.code}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-3">Outputs</h3>
        <p className="text-sm text-gray-600 mb-3">
          Select result variables to export as CSV files after the run. Selected: {selectedOutputCount}
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {(config.outputVariableOptions || []).map((name) => (
            <label key={name} className="flex items-start gap-2 p-3 border rounded-lg bg-white">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean((config.selectedOutputVariables || []).includes(name))}
                onChange={(e) => handleOutputToggle(name, e.target.checked)}
              />
              <span className="text-sm font-medium text-gray-800">{name}</span>
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 p-3 border rounded-lg bg-white">
          <input
            type="checkbox"
            className="mt-1"
            checked={config.generateDispatchPlot}
            onChange={(e) => handleChange("generateDispatchPlot", e.target.checked)}
          />
          <span>
            <span className="block font-medium">Generate dispatch HTML</span>
            <span className="block text-sm text-gray-500">
              Writes a dispatch plot file into the EMX results folder for this run.
            </span>
          </span>
        </label>
      </section>

      <section className="bg-white border rounded-xl p-4 mt-6">
        <h3 className="font-semibold mb-2">Run Summary</h3>
        <p className="text-sm text-gray-700">
          Horizons: {config.opPeriods} periods, optimize {config.optimHor}, implement {config.implHor}
        </p>
        <p className="text-sm text-gray-700">
          Carbon Emission Price: {config.emissionPrice}
        </p>
        <p className="text-sm text-gray-700">
          Countries selected: {selectedCountriesCount}
        </p>
        <p className="text-sm text-gray-700">
          Output variables selected: {selectedOutputCount}
        </p>
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
