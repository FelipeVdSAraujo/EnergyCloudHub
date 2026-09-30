import React, { useEffect, useMemo, useState } from "react";
import {
  deleteSavedDataset,
  getCurrentDatasetSelection,
  getSavedDatasets,
  getUploadedFiles,
  resetUploads,
  saveCurrentDataset,
  selectSavedDataset,
  uploadYamlFiles,
  validateDataset,
} from "./api";

export default function DataView() {
  const [selectedFiles, setSelectedFiles] = useState({});
  const [filesInfo, setFilesInfo] = useState({ files: [], requiredFiles: [], missingRequiredFiles: [] });
  const [validation, setValidation] = useState({ valid: false, missingRequiredFiles: [], issues: [] });
  const [currentDatasetName, setCurrentDatasetName] = useState("Baseline");
  const [currentDatasetSource, setCurrentDatasetSource] = useState("baseline");
  const [savedDatasets, setSavedDatasets] = useState([]);
  const [datasetName, setDatasetName] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [quickLoadSelection, setQuickLoadSelection] = useState("baseline");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedSavedDataset = useMemo(
    () => savedDatasets.find((dataset) => dataset._id === selectedDatasetId) || null,
    [savedDatasets, selectedDatasetId]
  );

  async function refreshAll() {
    const [uploads, current, saved, valid] = await Promise.all([
      getUploadedFiles(),
      getCurrentDatasetSelection(),
      getSavedDatasets(),
      validateDataset(),
    ]);

    setFilesInfo(uploads || { files: [], requiredFiles: [], missingRequiredFiles: [] });
    setCurrentDatasetName(current?.displayName || "Baseline");
    setCurrentDatasetSource(current?.source || "baseline");
    setSavedDatasets(saved?.datasets || []);
    setValidation(valid || { valid: false, missingRequiredFiles: [], issues: [] });

    if (current?.source === "saved" && current?.datasetId) {
      setQuickLoadSelection(`saved:${current.datasetId}`);
    } else {
      setQuickLoadSelection("baseline");
    }
  }

  useEffect(() => {
    refreshAll().catch((error) => {
      console.error(error);
      alert("Failed to load TransComp dataset info");
    });
  }, []);

  const handleFileSelect = (event, expectedFileName) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.name !== expectedFileName) {
      alert(`Please upload file named exactly ${expectedFileName}`);
      return;
    }
    setSelectedFiles((prev) => ({ ...prev, [expectedFileName]: file }));
  };

  const handleUpload = async () => {
    const formData = new FormData();
    Object.entries(selectedFiles).forEach(([name, file]) => {
      if (file) formData.append("files", file, name);
    });

    if (!formData.has("files")) {
      alert("No files selected");
      return;
    }

    try {
      setUploading(true);
      await uploadYamlFiles(formData);
      setSelectedFiles({});
      await refreshAll();
      alert("YAML files uploaded");
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.error || "Failed to upload YAML files");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset TransComp dataset overrides?")) return;
    try {
      await resetUploads();
      await refreshAll();
      alert("Dataset overrides reset");
    } catch (error) {
      console.error(error);
      alert("Failed to reset dataset overrides");
    }
  };

  const handleSaveDataset = async () => {
    const trimmedName = datasetName.trim();
    if (!trimmedName) {
      alert("Dataset name is required");
      return;
    }

    try {
      await saveCurrentDataset(trimmedName);
      setShowSaveModal(false);
      setDatasetName("");
      await refreshAll();
      alert("Dataset saved");
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.error || "Failed to save dataset");
    }
  };

  const handleLoadDataset = async () => {
    if (!selectedDatasetId) return;

    try {
      await selectSavedDataset(selectedDatasetId);
      setShowLoadModal(false);
      await refreshAll();
      alert("Dataset loaded");
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.error || "Failed to load dataset");
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedSavedDataset) return;
    if (!window.confirm(`Delete saved dataset "${selectedSavedDataset.name}"?`)) return;

    try {
      await deleteSavedDataset(selectedSavedDataset._id);
      setSelectedDatasetId("");
      await refreshAll();
      alert("Dataset deleted");
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.error || "Failed to delete dataset");
    }
  };

  const handleQuickLoad = async () => {
    try {
      if (quickLoadSelection === "baseline") {
        await resetUploads();
        await refreshAll();
        alert("Basque example dataset loaded");
        return;
      }

      if (!quickLoadSelection.startsWith("saved:")) {
        return;
      }

      const datasetId = quickLoadSelection.slice("saved:".length);
      if (!datasetId) return;

      await selectSavedDataset(datasetId);
      await refreshAll();
      alert("Dataset loaded");
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.error || "Failed to load selected dataset");
    }
  };

  const requiredFiles = filesInfo.requiredFiles || [];
  const missingRequired = validation.missingRequiredFiles || [];
  const isRuntimeDataset = currentDatasetSource === "runtime";
  const shouldShowMissingUploadWarning = isRuntimeDataset && missingRequired.length > 0;
  const statusText = validation.valid
    ? "Dataset is valid for required files."
    : shouldShowMissingUploadWarning
      ? "Upload mode is active, but not all required files are uploaded yet."
      : "Current dataset selection is active.";
  const statusClass = validation.valid
    ? "text-green-700"
    : shouldShowMissingUploadWarning
      ? "text-amber-700"
      : "text-slate-700";

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">TransComp Data Upload</h2>
      <p className="text-sm text-gray-600 mb-6">
        Upload YAML inputs for a full TransComp run. Current dataset: <strong>{currentDatasetName}</strong>
      </p>

      <section className="bg-white border rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">Dataset selection</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={quickLoadSelection}
            onChange={(e) => setQuickLoadSelection(e.target.value)}
            className="min-w-[260px] flex-1 rounded border px-3 py-2 text-sm"
          >
            <option value="baseline">Basque example (built-in)</option>
            {savedDatasets.map((dataset) => (
              <option key={dataset._id} value={`saved:${dataset._id}`}>
                Saved: {dataset.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleQuickLoad}
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Load selection
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Active source: <strong>{currentDatasetSource}</strong> ({currentDatasetName})
        </p>
      </section>

      <section className="bg-gray-50 border rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">Validation Status</h3>
        <p className={`text-sm ${statusClass}`}>
          {statusText}
        </p>
        {shouldShowMissingUploadWarning && (
          <div className="mt-3">
            <p className="text-sm font-medium">Missing required files:</p>
            <ul className="list-disc ml-5 text-sm">
              {missingRequired.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}
        {Array.isArray(validation.issues) && validation.issues.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium">YAML issues:</p>
            <ul className="list-disc ml-5 text-sm">
              {validation.issues.map((issue, idx) => (
                <li key={`${issue.filename}-${idx}`}>
                  {issue.filename}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">Upload YAML files</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {requiredFiles.map((filename) => (
            <div key={filename}>
              <label className="block text-sm font-medium mb-1">{filename}</label>
              <input type="file" accept=".yaml,.yml" onChange={(e) => handleFileSelect(e, filename)} className="block w-full border rounded p-1" />
              {selectedFiles[filename] && <span className="text-xs text-green-700">Selected</span>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload Selected"}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            Reset Overrides
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
          >
            Save Dataset
          </button>
          <button
            onClick={() => setShowLoadModal(true)}
            disabled={!savedDatasets.length}
            className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Load Dataset
          </button>
        </div>
      </section>

      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold mb-2">Detected dataset files</h3>
        <ul className="text-sm list-disc ml-5">
          {(filesInfo.files || []).map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </section>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Save dataset snapshot</h2>
            <input
              type="text"
              placeholder="Dataset name"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={handleSaveDataset} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Load dataset snapshot</h2>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
            >
              <option value="">Choose a saved dataset</option>
              {savedDatasets.map((dataset) => (
                <option key={dataset._id} value={dataset._id}>
                  {dataset.name} ({new Date(dataset.updatedAt).toLocaleString()})
                </option>
              ))}
            </select>

            <div className="flex justify-between gap-2">
              <button
                onClick={handleDeleteDataset}
                disabled={!selectedDatasetId}
                className="px-4 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowLoadModal(false)} className="px-4 py-2 rounded border">Cancel</button>
                <button
                  onClick={handleLoadDataset}
                  disabled={!selectedDatasetId}
                  className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
