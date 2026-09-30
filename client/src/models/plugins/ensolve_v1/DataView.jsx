import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  deleteSavedDataset,
  getCurrentDatasetSelection,
  getSavedDatasets,
  getUploadedFiles,
  saveCurrentDataset,
  selectSavedDataset,
  resetUploads,
  getExcelFile,
  uploadExcelFiles
} from './api';

/**
 * frnt_data.js
 * 
 * Uploads component for managing Excel input files in the EnSolve platform.
 * 
 * Features:
 * - Lists required Excel files for upload (General.xlsx, Generator.xlsx, etc.).
 * - Allows users to upload, reset, and edit Excel files.
 * - Displays uploaded files and provides download and edit options.
 * - Supports in-browser editing of Excel sheets using XLSX.js.
 * - Handles file selection, upload, and reset actions.
 * - Allows editing of individual cells in Excel sheets and saving changes back to the backend.
 * 
 * Uses:
 * - getUploadedFiles: Fetches list of uploaded files from backend.
 * - uploadExcelFiles: Uploads selected Excel files to backend.
 * - resetUploads: Resets all uploaded files to default state.
 * - getExcelFile: Downloads a specific Excel file for editing.
 * 
 * Exports:
 * - Uploads: React functional component for the data upload/edit page.
 */

const DataView = () => {
  const allowedFiles = ['General.xlsx', 'Generator.xlsx', 'Node.xlsx', 'Sets.xlsx', 'Storage.xlsx', 'Transmission.xlsx'];
  const [workbookData, setWorkbookData] = useState({});
  const [selectedSheet, setSelectedSheet] = useState('');
  const [selectedFiles, setSelectedFiles] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [overriddenFiles, setOverriddenFiles] = useState({});
  const [modifiedFiles, setModifiedFiles] = useState([]);
  const [overrideSizeBytes, setOverrideSizeBytes] = useState(0);
  const [editingFile, setEditingFile] = useState(null);
  const [excelData, setExcelData] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [currentDatasetName, setCurrentDatasetName] = useState('Baseline');
  const [savedDatasets, setSavedDatasets] = useState([]);
  const [datasetName, setDatasetName] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [showSaveDatasetModal, setShowSaveDatasetModal] = useState(false);
  const [showLoadDatasetModal, setShowLoadDatasetModal] = useState(false);

  const selectedSavedDataset = savedDatasets.find((dataset) => dataset._id === selectedDatasetId) || null;

  const formatBytes = (bytes) => {
    if (!bytes) return '0 KB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  useEffect(() => {
    fetchUploadedFiles();
    fetchSavedDatasets();
    refreshCurrentDatasetSelection();
  }, []);

  useEffect(() => {
    if (!showLoadDatasetModal) return;
    fetchSavedDatasets();
  }, [showLoadDatasetModal]);

  const fetchUploadedFiles = async () => {
    const data = await getUploadedFiles();
    setUploadedFiles(data?.files || []);
    setOverriddenFiles(data?.overridden || {});
    setModifiedFiles(data?.modifiedFiles || []);
    setOverrideSizeBytes(data?.overrideSizeBytes || 0);
  };

  const fetchSavedDatasets = async () => {
    const data = await getSavedDatasets();
    const datasets = data?.datasets || [];
    setSavedDatasets(datasets);
    setSelectedDatasetId((previousId) => {
      if (previousId && datasets.some((dataset) => dataset._id === previousId)) {
        return previousId;
      }
      const selected = datasets.find((dataset) => dataset.isSelected);
      return selected?._id || '';
    });
  };

  const refreshCurrentDatasetSelection = async () => {
    const data = await getCurrentDatasetSelection();
    setCurrentDatasetName(data?.displayName || 'Baseline');
  };

  const handleFileSelect = (e, expectedFileName) => {
    const file = e.target.files[0];
    if (!file || file.name !== expectedFileName) {
      alert(`Please upload correct file: ${expectedFileName}`);
      return;
    }
    setSelectedFiles(prev => ({ ...prev, [expectedFileName]: file }));
  };

  const handleUpload = async () => {
    setUploadingFile(false);
    const formData = new FormData();
    Object.entries(selectedFiles).forEach(([filename, file]) => {
      if (file) formData.append('files', file);
    });

    if (!formData.has('files')) {
      alert("No files selected");
      return;
    }

    await uploadExcelFiles(formData);
    alert('Files uploaded');
    setSelectedFiles({});
    await fetchUploadedFiles();
    await fetchSavedDatasets();
    await refreshCurrentDatasetSelection();
  };

  const handleReset = async () => {
    try {
      await resetUploads();
      alert("Dataset reset successfully");
      await fetchUploadedFiles();
      await fetchSavedDatasets();
      await refreshCurrentDatasetSelection();
    } catch (err) {
      console.error(err);
      alert("Failed to reset dataset");
    }
  };

  const handleSaveDataset = async () => {
    const trimmedName = datasetName.trim();
    if (!trimmedName) {
      alert('Dataset name is required');
      return;
    }

    try {
      await saveCurrentDataset(trimmedName);
      alert('Dataset saved successfully');
      setShowSaveDatasetModal(false);
      setDatasetName('');
      await fetchUploadedFiles();
      await fetchSavedDatasets();
      await refreshCurrentDatasetSelection();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || 'Failed to save dataset');
    }
  };

  const handleLoadSelectedDataset = async () => {
    if (!selectedDatasetId) {
      return;
    }

    try {
      await selectSavedDataset(selectedDatasetId);
      alert('Dataset loaded successfully');
      setShowLoadDatasetModal(false);
      await fetchUploadedFiles();
      await fetchSavedDatasets();
      await refreshCurrentDatasetSelection();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || 'Failed to load dataset');
    }
  };

  const handleDeleteSavedDataset = async () => {
    if (!selectedSavedDataset) {
      return;
    }

    if (!window.confirm(`Delete saved dataset "${selectedSavedDataset.name}"?`)) {
      return;
    }

    try {
      await deleteSavedDataset(selectedSavedDataset._id);
      alert('Dataset deleted successfully');
      setSelectedDatasetId('');
      await fetchSavedDatasets();
      await refreshCurrentDatasetSelection();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || 'Failed to delete dataset');
    }
  };

  const loadExcelForEditing = async (filename) => {
    const data = await getExcelFile(filename);
    const workbook = XLSX.read(data, { type: 'array' });

    const allSheets = {};
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      allSheets[sheetName] = json;
    });

    setEditingFile(filename);
    setWorkbookData(allSheets);
    setSelectedSheet(workbook.SheetNames[0]);
    setExcelData(allSheets[workbook.SheetNames[0]]);
  };

  const handleDownload = async (filename) => {
    try {
      const data = await getExcelFile(filename);
  
      // Convert the binary data to a Blob
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
  
      // Create a temporary download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename; // Preserve original filename
      document.body.appendChild(link);
      link.click();
  
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file.');
    }
  };


  const handleCellChange = (sheet, i, j, value) => {
    const updated = workbookData[sheet].map((row, rowIndex) =>
      row.map((cell, colIndex) =>
        rowIndex === i && colIndex === j ? value : cell
      )
    );
    setWorkbookData({ ...workbookData, [sheet]: updated });
    setExcelData(updated);
  };

  const saveEditedFile = async () => {
    const workbook = XLSX.utils.book_new();
    Object.keys(workbookData).forEach(sheetName => {
      const data = workbookData[sheetName];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const formData = new FormData();
    formData.append('files', new File([blob], editingFile));

    await uploadExcelFiles(formData);
    alert('File updated!');
    setEditingFile(null);
    await fetchUploadedFiles();
    await fetchSavedDatasets();
    await refreshCurrentDatasetSelection();
  };
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h2 className="text-2xl font-bold mb-3">Edit Dataset Files</h2>
      <p className="text-sm text-gray-700 mb-2">
        Current dataset: <strong>{currentDatasetName}</strong>
      </p>
      <p className="text-sm text-gray-500 mb-6">
        Modified files in your working copy: {modifiedFiles.length} of {allowedFiles.length} • {formatBytes(overrideSizeBytes)}
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={() => setUploadingFile(!uploadingFile)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {uploadingFile ? 'Cancel Upload' : 'Upload Files'}
        </button>

        <button
          onClick={() => setShowSaveDatasetModal(true)}
          disabled={!modifiedFiles.length}
          title={!modifiedFiles.length ? 'Modify at least one file before saving a dataset' : ''}
          className="bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Save Dataset
        </button>

        <button
          onClick={() => setShowLoadDatasetModal(true)}
          disabled={!savedDatasets.length}
          title={!savedDatasets.length ? 'No saved datasets found' : ''}
          className="bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Load Dataset
        </button>

        <button
          onClick={handleReset}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Reset Dataset
        </button>
      </div>

      <div className="text-sm text-gray-500 mb-6">
        Saved datasets: {savedDatasets.length}/5 • {formatBytes(savedDatasets.reduce((total, dataset) => total + Number(dataset.sizeBytes || 0), 0))} / 100 MB
      </div>

      {uploadingFile && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h3 className="text-lg font-semibold mb-3">Select Required Files</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allowedFiles.map(filename => (
              <div key={filename}>
                <label className="block font-medium text-gray-700 mb-1">{filename}</label>
                <input
                  type="file"
                  className="block w-full border rounded p-1"
                  onChange={e => handleFileSelect(e, filename)}
                />
                {selectedFiles[filename] && <span className="text-green-600 text-sm">✅ Selected</span>}
              </div>
            ))}
          </div>
          <button
            onClick={handleUpload}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Upload
          </button>
        </div>
      )}

      <h3 className="text-xl font-semibold mb-2">Dataset Files</h3>
      <p className="text-sm text-gray-500 mb-3">Baseline dataset is shown by default. Files you have customised are marked <span className="text-amber-600 font-medium">Modified</span>.</p>
      <ul className="mb-6">
        {uploadedFiles.map(file => (
          <li key={file} className="flex items-center justify-between border-b py-2">
            <span className="flex items-center gap-2">
              <button
                onClick={() => handleDownload(file)}
                className="text-blue-600 underline"
              >
                {file}
              </button>
              {overriddenFiles[file] && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5">Modified</span>
              )}
            </span>
            <button
              onClick={() => loadExcelForEditing(file)}
              className="text-sm bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
            >
              Edit
            </button>
          </li>
        ))}
      </ul>

      {showSaveDatasetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Save dataset</h2>

            <input
              type="text"
              placeholder="Dataset name"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4 focus:outline-none focus:ring"
              autoFocus
            />

            <div className="text-sm text-gray-600 bg-gray-50 border rounded p-3 mb-4">
              <div className="mb-2">This snapshot will save {modifiedFiles.length} modified file(s).</div>
              <div className="mb-2">Estimated storage: {formatBytes(overrideSizeBytes)}</div>
              <ul className="list-disc ml-5">
                {modifiedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveDatasetModal(false);
                  setDatasetName('');
                }}
                className="px-4 py-2 rounded border"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveDataset}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadDatasetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Load dataset</h2>

            {savedDatasets.length === 0 ? (
              <div className="text-sm text-gray-600">No saved datasets found.</div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Select a saved dataset:
                </label>

                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="" disabled>
                    Choose a dataset…
                  </option>

                  {savedDatasets.map((dataset) => (
                    <option key={dataset._id} value={dataset._id}>
                      {dataset.name} • {dataset.changedFiles.length} file(s) • {formatBytes(dataset.sizeBytes)}
                    </option>
                  ))}
                </select>

                {selectedSavedDataset && (
                  <div className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-48">
                    <div className="font-semibold text-sm text-gray-700 mb-2">Snapshot details</div>
                    <div className="mb-1">Modified files: {selectedSavedDataset.changedFiles.length}</div>
                    <div className="mb-1">Stored size: {formatBytes(selectedSavedDataset.sizeBytes)}</div>
                    <div className="mb-2">Updated: {new Date(selectedSavedDataset.updatedAt).toLocaleString()}</div>
                    <ul className="list-disc ml-5">
                      {selectedSavedDataset.changedFiles.map((file) => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={handleDeleteSavedDataset}
                disabled={!selectedSavedDataset}
                className="px-4 py-2 rounded border border-red-300 text-red-700 disabled:opacity-50"
              >
                Delete
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowLoadDatasetModal(false);
                    setSelectedDatasetId('');
                  }}
                  className="px-4 py-2 rounded border"
                >
                  Cancel
                </button>

                <button
                  onClick={handleLoadSelectedDataset}
                  disabled={!selectedDatasetId}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingFile && (
        <div className="mt-10 bg-white p-4 rounded shadow">
          <h3 className="text-lg font-semibold mb-4">Editing: {editingFile}</h3>

          <label className="block font-medium mb-2">Sheet:</label>
          <select
            className="mb-4 p-2 border rounded"
            value={selectedSheet}
            onChange={(e) => {
              setSelectedSheet(e.target.value);
              setExcelData(workbookData[e.target.value]);
            }}
          >
            {Object.keys(workbookData).map(sheetName => (
              <option key={sheetName} value={sheetName}>
                {sheetName}
              </option>
            ))}
          </select>

          <div className="overflow-auto max-h-[400px] border rounded mb-4">
            <table className="min-w-full table-auto text-sm">
              <tbody>
                {excelData.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="border p-1">
                        <input
                          value={cell}
                          onChange={e => handleCellChange(selectedSheet, i, j, e.target.value)}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={saveEditedFile}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default DataView;
