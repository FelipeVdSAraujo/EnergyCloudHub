// client/src/models/plugins/ukraine/ConfigForm.jsx
//
// Ukraine FBMC configuration form (plan task 3.2). Everything is metadata
// driven from GET /api/ukraine/config (scenario catalog from the networks
// manifest, security modes, GSK / base-case whitelists, VOLL bounds, window
// constraints) — the client never hardcodes model options. Validation is
// server-side truth: PUT /api/ukraine/config returns 400 with
// { errors, warnings } and those are rendered under the form.

import React, { useEffect, useState } from "react";
import {
  getConfig,
  saveConfig,
  selectConfig,
  resetConfig,
  fetchUserConfigs,
} from "./api";

// "2023-01-15 00:00:00" -> "2023-01-15T00:00" (<input type="datetime-local">)
function toDatetimeLocal(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

// "2023-01-15T00:00" -> "2023-01-15 00:00:00" (server hour-precision format)
function fromDatetimeLocal(value) {
  if (!value) return "";
  return `${String(value).replace("T", " ")}:00`;
}

// Rough run-duration estimate from the measured Phase-2 envelope on the
// compute box: N-0 ≈ 3 min per window day, N-1 ≈ 24 min per window day.
function estimateRunMinutes(values) {
  if (!values?.window_start || !values?.window_end) return null;
  const start = Date.parse(String(values.window_start).replace(" ", "T"));
  const end = Date.parse(String(values.window_end).replace(" ", "T"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = (end - start) / 86400000;
  const perDay = values.security === "on" ? 24 : 3;
  return Math.max(1, Math.round(days * perDay));
}

export default function ConfigForm() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState(null);
  const [options, setOptions] = useState(null);
  const [constraints, setConstraints] = useState(null);
  const [selected, setSelected] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const data = await getConfig();
      setValues(data?.values || {});
      setOptions(data?.options || null);
      setConstraints(data?.constraints || null);
      setSelected(data?.selected || null);
      setErrors(data?.validation?.errors || []);
      setWarnings(data?.validation?.warnings || []);
      const userConfigs = await fetchUserConfigs();
      setConfigs(Array.isArray(userConfigs) ? userConfigs : []);
    } catch (error) {
      console.error(error);
      setErrors([
        `Failed to load Ukraine config: ${error?.response?.data?.error || error.message}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key, value) => setValues((prev) => ({ ...(prev || {}), [key]: value }));

  const handleSave = async () => {
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    setNotice("");
    try {
      const name = fileName.trim() || selected?.displayName || "Ukraine";
      const result = await saveConfig(name, values);
      setNotice(result?.message || "Config saved");
      if (Array.isArray(result?.validation?.warnings)) {
        setWarnings(result.validation.warnings);
      }
      setFileName("");
      await load();
    } catch (error) {
      const data = error?.response?.data || {};
      setErrors(
        Array.isArray(data.errors) ? data.errors : [data.error || "Failed to save config"]
      );
      if (Array.isArray(data.warnings)) setWarnings(data.warnings);
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = async (configId) => {
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    setNotice("");
    try {
      await selectConfig(configId);
      await load();
    } catch (error) {
      setErrors([error?.response?.data?.error || "Failed to select config"]);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset to the default web template? Saved configs are kept but deselected."
      )
    ) {
      return;
    }
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    setNotice("");
    try {
      const result = await resetConfig();
      setNotice(result?.message || "Selection reset to the default template");
      await load();
    } catch (error) {
      setErrors([error?.response?.data?.error || "Failed to reset config"]);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !values) {
    return <div className="text-sm text-gray-500">Loading Ukraine config...</div>;
  }

  const scenario = (options?.scenarios || []).find((s) => s.key === values.scenario);
  const estimate = estimateRunMinutes(values);
  const vollBounds = options?.voll || {};

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Ukraine FBMC Config</h2>
      <p className="text-sm text-gray-600 mb-4">
        Configure a day-ahead window of the 2023 reference year and the FBMC
        settings used for the run. Values are validated on the server.
      </p>

      <div className="mb-4 p-3 rounded-lg bg-gray-50 border text-sm text-gray-700">
        Active config:{" "}
        <span className="font-medium">{selected?.displayName || "Web_Template"}</span>
        {selected?.source === "default" ? " (default template)" : " (saved)"}
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Config is invalid:</p>
          <ul className="list-disc ml-5 mt-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Warnings:</p>
          <ul className="list-disc ml-5 mt-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-gray-50 border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Scenario, security and window</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Scenario</label>
              <select
                value={values.scenario || ""}
                onChange={(e) => setField("scenario", e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {(options?.scenarios || []).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {scenario && (
                <p className="text-xs text-gray-500 mt-1">
                  {scenario.case} dataset
                  {scenario.size_bytes
                    ? ` — ${(scenario.size_bytes / 1e9).toFixed(1)} GB network`
                    : ""}
                  .
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Security constraints</label>
              <select
                value={values.security || "off"}
                onChange={(e) => setField("security", e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {(options?.security_modes || []).map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "on"
                      ? "on — N-1 (contingency secured)"
                      : "off — N-0 (no contingencies)"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                N-1 runs are roughly 8x slower than N-0.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Window start</label>
              <input
                type="datetime-local"
                step={3600}
                value={toDatetimeLocal(values.window_start)}
                min={toDatetimeLocal(constraints?.network_first)}
                max={toDatetimeLocal(values.window_end || constraints?.network_last)}
                onChange={(e) => setField("window_start", fromDatetimeLocal(e.target.value))}
                className="w-full border rounded px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Window end</label>
              <input
                type="datetime-local"
                step={3600}
                value={toDatetimeLocal(values.window_end)}
                min={toDatetimeLocal(values.window_start || constraints?.network_first)}
                max={toDatetimeLocal(constraints?.network_last)}
                onChange={(e) => setField("window_end", fromDatetimeLocal(e.target.value))}
                className="w-full border rounded px-3 py-2 bg-white"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Hour precision, up to {constraints?.window_max_days ?? 7} days, within{" "}
            {constraints?.network_first} → {constraints?.network_last}.
          </p>
          {estimate != null && (
            <p className="text-xs text-gray-600 mt-1">
              Estimated runtime on the compute box: ≈ {estimate} min (
              {values.security === "on" ? "N-1 ≈ 24" : "N-0 ≈ 3"} min per window day, measured).
            </p>
          )}
        </div>

        <div className="bg-gray-50 border rounded-xl p-4">
          <h3 className="font-semibold mb-3">FBMC settings</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">GSK strategy</label>
              <select
                value={values.gsk_strategy || ""}
                onChange={(e) => setField("gsk_strategy", e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {(options?.gsk_strategies || []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Generation shift keys distribute each zone's net-position change
                across its buses.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Base case</label>
              <select
                value={values.base_case_strategy || ""}
                onChange={(e) => setField("base_case_strategy", e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {(options?.base_cases || []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Zonal PTDFs are computed around this reference dispatch.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Value of lost load (VOLL, {vollBounds.unit || "EUR/MWh"})
              </label>
              <input
                type="number"
                min={vollBounds.min}
                max={vollBounds.max}
                step={100}
                value={values.voll ?? ""}
                onChange={(e) => setField("voll", Number(e.target.value))}
                className="w-full border rounded px-3 py-2 bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Cost per MWh of unserved energy; range {vollBounds.min}–
                {vollBounds.max} {vollBounds.unit || "EUR/MWh"}.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border rounded-xl p-4">
        <h3 className="font-semibold mb-3">Save configuration</h3>
        <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Save as</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={selected?.displayName || "my_ukraine_config"}
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Saved configs are per-user; the active one is used by Run model.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Saving..." : "Save & Select"}
            </button>
            <button
              onClick={handleReset}
              disabled={busy}
              className="px-4 py-2 rounded border border-gray-300 hover:bg-white disabled:opacity-60"
            >
              Use Default
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border rounded-xl p-4">
        <h3 className="font-semibold mb-3">Your saved configurations</h3>
        {configs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No saved configs yet — the default template is in use.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Config</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c._id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{c.filename}</td>
                    <td className="py-2 pr-4">
                      {c.updatedAt
                        ? String(c.updatedAt).slice(0, 19).replace("T", " ")
                        : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {selected?.configId === c._id ? (
                        <span className="text-green-700 font-medium">selected</span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {selected?.configId !== c._id && (
                        <button
                          onClick={() => handleSelect(c._id)}
                          disabled={busy}
                          className="px-2 py-0.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
                        >
                          Select
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

}
