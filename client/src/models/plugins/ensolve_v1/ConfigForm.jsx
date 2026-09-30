

/**
 * ConfigEditor Component
 * 
 * Provides a user interface for viewing and editing the model configuration.
 * 
 * Features:
 * - Fetches current configuration from the backend on mount.
 * - Allows editing of various config fields (forecast horizon, season length, discount rate, etc.).
 * - Supports dropdowns, number inputs, and boolean toggles for config options.
 * - "Reset Config" button restores default config from backend.
 * - "Save" button updates the config on the backend.
 * - Displays loading state while fetching config.
 * 
 * Uses:
 * - getConfig: Fetch current config from backend.
 * - apiResetConfig: Reset config to default.
 * - apiSaveConfig: Save updated config to backend.
 */

import React, { useEffect, useState } from "react";
import {
  getConfig,
  getCurrentConfigSelection,
  validateCurrentConfig,
  validateConfigDraft,
  resetConfig as apiResetConfig,
  saveConfig as apiSaveConfig,
  getUserConfigs,
  selectConfig as apiSelectConfig,
} from "./api";

const ConfigForm = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentConfigName, setCurrentConfigName] = useState("Test_Run");
  const [warnings, setWarnings] = useState([]);

  const [fileName, setFileName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);

  const [userConfigs, setUserConfigs] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState("");

  useEffect(() => {
    getConfig()
      .then((data) => {
        setConfig(data);
        return validateCurrentConfig();
      })
      .then((validation) => {
        setWarnings(validation?.warnings || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const refreshCurrentConfigSelection = () => {
    return getCurrentConfigSelection()
      .then((data) => {
        if (data?.displayName) {
          setCurrentConfigName(data.displayName);
        }
        if (data?.configId) {
          localStorage.setItem("selectedEmpireConfigId", String(data.configId));
        } else {
          localStorage.removeItem("selectedEmpireConfigId");
        }
      })
      .catch((err) => {
        console.error(err);
      });
  };

  useEffect(() => {
    refreshCurrentConfigSelection();
  }, []);

  // Fetch saved configs once on mount
  useEffect(() => {
    getUserConfigs()
      .then((data) => {
        // backend returns { configs: [...] }
        const filteredConfigs = (data?.configs || []);
        setUserConfigs(filteredConfigs);
        const selected = filteredConfigs.find((cfg) => cfg.isSelected);
        if (selected?._id) {
          setSelectedConfigId(selected._id);
          localStorage.setItem("selectedEmpireConfigId", String(selected._id));
        }

      })
      .catch((err) => console.error(err));
  }, []);

  // Optional: refresh configs every time the load modal opens
  useEffect(() => {
    if (!showLoadModal) return;
    getUserConfigs()
      .then((data) => setUserConfigs(data?.configs || []))
      .catch((err) => console.error(err));
  }, [showLoadModal]);

  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset the config to default?")) {
      apiResetConfig()
        .then(() => {
          alert("Config reset successfully");
          return getConfig();
        })
        .then((data) => {
          setConfig(data);
          return validateCurrentConfig();
        })
        .then((validation) => {
          setWarnings(validation?.warnings || []);
          return refreshCurrentConfigSelection();
        })
        .catch((err) => {
          console.error(err);
          alert("Failed to reset config");
        });
    }
  };

  const handleChange = (key, value) => {
    setConfig((prev) => {
      const nextConfig = { ...(prev || {}), [key]: value };
      validateConfigDraft(nextConfig)
        .then((validation) => {
          setWarnings(validation?.warnings || []);
        })
        .catch((err) => {
          console.error(err);
        });
      return nextConfig;
    });
  };

  const handleSave = () => {
    const model = localStorage.getItem("activeModelId");
    const payload = {
      ModelName: model,
      fileName: fileName,
      mimeType: "application/json",
      content: config,
    };

    apiSaveConfig(payload)
      .then((data) => {
        if (data?.data?.displayName) {
          setCurrentConfigName(data.data.displayName);
        }
        if (data?.data?.configId) {
          localStorage.setItem("selectedEmpireConfigId", String(data.data.configId));
        } else {
          localStorage.removeItem("selectedEmpireConfigId");
        }
        alert(`Config updated successfully (${data?.data?.filename || "ensolve_run.yaml"})`);
        return getUserConfigs();
      })
      .then((data) => {
        setUserConfigs(data?.configs || []);
        return validateCurrentConfig();
      })
      .then((validation) => {
        setWarnings(validation?.warnings || []);
        return refreshCurrentConfigSelection();
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to update config");
      });
  };

  const handleLoadSelectedConfig = () => {
    const selected = userConfigs.find((c) => c._id === selectedConfigId);
    if (!selected) return;

    apiSelectConfig(selectedConfigId)
      .then((result) => {
        setConfig(selected.content);
        if (result?.displayName) {
          setCurrentConfigName(result.displayName);
        }
        localStorage.setItem("selectedEmpireConfigId", selectedConfigId);
        return validateConfigDraft(selected.content);
      })
      .then((validation) => {
        setWarnings(validation?.warnings || []);
        return getUserConfigs();
      })
      .then((data) => {
        setUserConfigs(data?.configs || []);
        return refreshCurrentConfigSelection();
      })
      .then(() => {
        setShowLoadModal(false);
        setSelectedConfigId("");
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load selected config");
      });
  };

  if (loading || !config) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow rounded-lg mt-10">
      <h2 className="text-2xl font-bold mb-6 text-center">Config Editor</h2>
      <p className="text-sm text-gray-700 text-center mb-6">
        Currently selected config: <strong>{currentConfigName}</strong>
      </p>

      {warnings.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">Consistency Warnings</h3>
          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <div
                key={`${warning.code || "warning"}-${index}`}
                className={
                  warning.severity === "warning"
                    ? "text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                    : "text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded px-3 py-2"
                }
              >
                <div>{warning.message}</div>
                {Array.isArray(warning.details) && warning.details.length > 0 && (
                  <ul className="list-disc ml-5 mt-1">
                    {warning.details.map((detail, detailIndex) => (
                      <li key={`${warning.code || "detail"}-${detailIndex}`}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* forecast_horizon_year */}
      <div className="mb-4">
        <label htmlFor="forecastDropdown" className="block font-medium mb-1">
          forecast_horizon_year:
        </label>
        <select
          id="forecastDropdown"
          value={config["forecast_horizon_year"] ?? 2025}
          onChange={(e) =>
            handleChange("forecast_horizon_year", Number(e.target.value))
          }
          className="w-full border rounded px-3 py-2"
        >
          {Array.from({ length: (2060 - 2025) / 5 + 1 }, (_, i) => {
            const year = 2025 + i * 5;
            return (
              <option key={year} value={year}>
                {year}
              </option>
            );
          })}
        </select>
      </div>

      {/* length_of_regular_season */}
      <div className="mb-4">
        <label htmlFor="seasonLengthInput" className="block font-medium mb-1">
          length_of_regular_season:
        </label>
        <input
          id="seasonLengthInput"
          type="number"
          min="10"
          max="168"
          value={config["length_of_regular_season"] ?? 10}
          onChange={(e) =>
            handleChange("length_of_regular_season", Number(e.target.value))
          }
          onBlur={(e) => {
            const numValue = Number(e.target.value);
            const clamped = Math.max(10, Math.min(168, numValue));
            handleChange("length_of_regular_season", clamped);
          }}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* discount_rate */}
      <div className="mb-4">
        <label htmlFor="discountRateInput" className="block font-medium mb-1">
          discount_rate:
        </label>
        <input
          id="discountRateInput"
          type="number"
          step="0.01"
          min="0.01"
          max="0.1"
          value={config["discount_rate"] ?? 0.01}
          onChange={(e) => handleChange("discount_rate", Number(e.target.value))}
          onBlur={(e) => {
            const numValue = Number(e.target.value);
            const clamped = Math.max(0.01, Math.min(0.1, numValue));
            handleChange("discount_rate", clamped);
          }}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* wacc */}
      <div className="mb-4">
        <label htmlFor="waccInput" className="block font-medium mb-1">
          wacc:
        </label>
        <input
          id="waccInput"
          type="number"
          step="0.01"
          min="0.01"
          max="0.1"
          value={config["wacc"] ?? 0.01}
          onChange={(e) => handleChange("wacc", Number(e.target.value))}
          onBlur={(e) => {
            const numValue = Number(e.target.value);
            const clamped = Math.max(0.01, Math.min(0.1, numValue));
            handleChange("wacc", clamped);
          }}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* number_of_scenarios */}
      <div className="mb-4">
        <label htmlFor="scenariosDropdown" className="block font-medium mb-1">
          number_of_time_series:
        </label>
        <select
          id="scenariosDropdown"
          value={config["number_of_scenarios"] ?? 1}
          onChange={(e) =>
            handleChange("number_of_scenarios", Number(e.target.value))
          }
          className="w-full border rounded px-3 py-2"
        >
          {Array.from({ length: 5 }, (_, i) => {
            const val = i + 1;
            return (
              <option key={val} value={val}>
                {val}
              </option>
            );
          })}
        </select>
      </div>

      {/* optimization_solver */}
      <div className="mb-4">
        <label htmlFor="solverDropdown" className="block font-medium mb-1">
          optimization_solver:
        </label>
        <select
          id="solverDropdown"
          value={config["optimization_solver"] ?? "gurobi"}
          onChange={(e) => handleChange("optimization_solver", e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="gurobi">Gurobi</option>
          <option value="cplex">CPLEX</option>
          <option value="fico_xpress">FICO Xpress</option>
        </select>
      </div>

      {/* use_scenario_generation */}
      <div className="mb-4">
        <label htmlFor="scenarioGenDropdown" className="block font-medium mb-1">
          time_series_generation:
        </label>
        <select
          id="scenarioGenDropdown"
          value={String(config["use_scenario_generation"] ?? false)}
          onChange={(e) =>
            handleChange("use_scenario_generation", e.target.value === "true")
          }
          className="w-full border rounded px-3 py-2"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </div>

      {/* use_fixed_sample */}
      <div className="mb-4">
        <label htmlFor="fixedSampleDropdown" className="block font-medium mb-1">
          use_fixed_sample:
        </label>
        <select
          id="fixedSampleDropdown"
          value={String(config["use_fixed_sample"] ?? false)}
          onChange={(e) =>
            handleChange("use_fixed_sample", e.target.value === "true")
          }
          className="w-full border rounded px-3 py-2"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </div>

      {/* use_emission_cap */}
      <div className="mb-6">
        <label htmlFor="emissionCapDropdown" className="block font-medium mb-1">
          use_emission_cap:
        </label>
        <select
          id="emissionCapDropdown"
          value={String(config["use_emission_cap"] ?? false)}
          onChange={(e) =>
            handleChange("use_emission_cap", e.target.value === "true")
          }
          className="w-full border rounded px-3 py-2"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </div>

      {/* Buttons */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded"
          >
            Reset Config
          </button>

          <button
            onClick={() => setShowLoadModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
            disabled={!userConfigs.length}
            title={!userConfigs.length ? "No saved configs to load" : ""}
          >
            Load Config
          </button>
        </div>

        <button
          onClick={() => setShowSaveModal(true)}
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded"
        >
          Save
        </button>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Save configuration</h2>

            <input
              type="text"
              placeholder="Optional name (leave empty for ensolve_run.yaml)"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4 focus:outline-none focus:ring"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded border"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  handleSave();
                  setShowSaveModal(false);
                  setFileName("");
                }}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Load configuration</h2>

            {userConfigs.length === 0 ? (
              <div className="text-sm text-gray-600">No saved configs found.</div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Select a saved config:
                </label>

                <select
                  value={selectedConfigId}
                  onChange={(e) => setSelectedConfigId(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="" disabled>
                    Choose a config…
                  </option>

                  {userConfigs.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.filename || "unnamed"} • {c.model} •{" "}
                      {new Date(c.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>

                {selectedConfigId && (
                  <div className="text-xs bg-gray-50 border rounded p-2 overflow-auto max-h-40">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(
                        userConfigs.find((c) => c._id === selectedConfigId)
                          ?.content,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowLoadModal(false);
                  setSelectedConfigId("");
                }}
                className="px-4 py-2 rounded border"
              >
                Cancel
              </button>

              <button
                onClick={handleLoadSelectedConfig}
                disabled={!selectedConfigId}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded"
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigForm;

