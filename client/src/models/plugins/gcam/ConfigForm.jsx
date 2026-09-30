import React, { useEffect, useState } from "react";
import { getConfig, resetConfig, saveConfig } from "./api";

const DEFAULTS = {
  gcamHome: "C:\\EnSolveCloudGCAM",
  configurationFile: "configuration_ref.xml",
  scenarioName: "GCAM_Web_Ref",
  useBatchMode: false,
  batchFileName: "batch_SSP_REF.xml",
  stopPeriod: -1,
  createCostCurve: false,
  findPath: false,
  notes: "Reference configuration for web-triggered GCAM runs",
};

// Configuration profile files available in the GCAM exe folder.
const COMMON_CONFIG_FILES = [
  "configuration_ref.xml",
  "configuration.xml",
  "configuration_ssp.xml",
  "configuration_policy.xml",
  "configuration_usa.xml",
];

function NumberField({ label, value, onChange, min = -1, help }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border rounded px-3 py-2"
      />
      {help ? <p className="text-xs text-gray-500 mt-1">{help}</p> : null}
    </div>
  );
}

function CheckboxField({ label, checked, onChange, help }) {
  return (
    <div className="border rounded px-3 py-2 bg-white h-full">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {help ? <p className="text-xs text-gray-500 mt-1">{help}</p> : null}
    </div>
  );
}

export default function ConfigForm() {
  const [config, setConfig] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig()
      .then((data) => setConfig({ ...DEFAULTS, ...(data || {}) }))
      .catch((error) => {
        console.error(error);
        alert("Failed to load GCAM config");
      })
      .finally(() => setLoading(false));
  }, []);

  const setField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveConfig(config);
      if (result?.config) {
        setConfig({ ...DEFAULTS, ...result.config });
      }
      alert("GCAM config saved");
    } catch (error) {
      console.error(error);
      alert("Failed to save GCAM config");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset GCAM config to defaults?")) return;
    try {
      const result = await resetConfig();
      setConfig({ ...DEFAULTS, ...(result?.config || {}) });
    } catch (error) {
      console.error(error);
      alert("Failed to reset GCAM config");
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading GCAM config...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">GCAM Config</h2>
      <p className="text-sm text-gray-600 mb-6">
        Configure model execution options for GCAM runs.
      </p>

      <div className="space-y-4 bg-gray-50 border rounded-xl p-4">
        <h3 className="font-semibold">Execution</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Configuration profile file</label>
            <select
              value={config.configurationFile}
              onChange={(e) => setField("configurationFile", e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white"
            >
              {COMMON_CONFIG_FILES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Relative to the GCAM exe folder on the Windows runner host.
            </p>
          </div>

          <NumberField
            label="Stop period"
            value={config.stopPeriod}
            onChange={(value) => setField("stopPeriod", value)}
            help="Use -1 to run all model periods."
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <CheckboxField
            label="Create cost curve"
            checked={config.createCostCurve}
            onChange={(value) => setField("createCostCurve", value)}
            help="Generates cost_curves.xml with CO2 abatement cost curves. Useful for policy analysis."
          />
          <CheckboxField
            label="Find path"
            checked={config.findPath}
            onChange={(value) => setField("findPath", value)}
            help="Runs GCAM in find-equilibrium-price-path mode. Needed for some calibration and debug workflows."
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <CheckboxField
            label="Use batch mode"
            checked={config.useBatchMode}
            onChange={(value) => setField("useBatchMode", value)}
            help="Runs all scenarios listed in the batch file in sequence, reusing the loaded data system."
          />
          {config.useBatchMode ? (
            <div>
              <label className="block text-sm font-medium mb-1">Batch file name</label>
              <input
                value={config.batchFileName}
                onChange={(e) => setField("batchFileName", e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="batch_SSP_REF.xml"
              />
              <p className="text-xs text-gray-500 mt-1">
                XML file in the GCAM exe folder that lists the scenarios to run.
              </p>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

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
