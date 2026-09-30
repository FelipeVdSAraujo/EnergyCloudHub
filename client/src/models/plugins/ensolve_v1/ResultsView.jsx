import React, { useState, useEffect } from 'react';
import { listDir, getDownloadUrl, fetchIamcExport } from './api';

/**
 * frnt_results.js
 * 
 * Results browser component for the EnSolve platform.
 * 
 * Features:
 * - Displays a navigable folder/file tree of analysis run results.
 * - Allows users to expand/collapse folders to browse nested results.
 * - Provides download buttons for individual result files.
 * - Shows loading states for folders and root directory.
 * - Uses Tailwind CSS classes for styling.
 * 
 * Components:
 * - Folder: Recursive component for displaying folders and their contents.
 * - FileItem: Component for displaying a file with a download button.
 * - ActiveFileBrowser: Main component that loads and displays the root results directory.
 * 
 * Uses:
 * - listDir: Fetches directory contents from backend.
 * - getDownloadUrl: Generates download URL for a file.
 * 
 * Exports:
 * - ActiveFileBrowser: React functional component for the results browsing page.
 */

function RunRow({ entry }) {
  const [dlState, setDlState] = useState('idle'); // idle | loading | error | unavailable

  const handleIamcDownload = async () => {
    setDlState('loading');
    try {
      const res = await fetchIamcExport(entry.name, 'EMPIRE v1.0.0/v51-test');
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entry.name}_iamc.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setDlState('idle');
    } catch (err) {
      setDlState(err?.response?.status === 404 ? 'unavailable' : 'error');
      setTimeout(() => setDlState('idle'), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="flex-1">
        <Folder name={entry.name} path={entry.path} />
      </div>
      <button
        onClick={handleIamcDownload}
        disabled={dlState === 'loading'}
        className="shrink-0 px-2 py-0.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition"
        title="Download annual IAMC-format CSV for upload to Scenario Explorer"
      >
        {dlState === 'loading' ? 'Preparing…' :
         dlState === 'unavailable' ? 'No IAMC data' :
         dlState === 'error' ? 'Error' :
         '⬇ IAMC'}
      </button>
    </div>
  );
}

function Folder({ name, path }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleFolder = async () => {
    if (!expanded) {
      setLoading(true);
      try {
        const contents = await listDir(path);
        setChildren(contents);
      } catch (err) {
        console.error('Error loading folder:', err);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="ml-4">
      <div
        className="flex items-center cursor-pointer hover:text-blue-600 transition"
        onClick={toggleFolder}
        title={expanded ? 'Click to collapse' : 'Click to expand'}
      >
        <span className="mr-2 text-xl">{expanded ? '📂' : '📁'}</span>
        <span className="font-medium">{name}</span>
        {loading && <span className="ml-2 animate-pulse text-sm text-gray-500">Loading...</span>}
      </div>

      {expanded && (
        <div className="mt-1">
          {children.length === 0 ? (
            <div className="ml-6 text-sm italic text-gray-500">Empty folder</div>
          ) : (
            children.map((child, idx) =>
              child.type === 'folder' ? (
                <Folder key={idx} name={child.name} path={child.path} />
              ) : (
                <FileItem key={idx} name={child.name} path={child.path} />
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

function FileItem({ name, path }) {
  const handleDownload = () => {
    const downloadUrl = getDownloadUrl(path);
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="ml-8 flex items-center mt-1 group">
      <span className="text-sm text-gray-700 group-hover:text-blue-600 transition">
        {name}
      </span>
      <button
        onClick={handleDownload}
        className="ml-3 px-2 py-0.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition"
        title="Download file"
      >
        Download
      </button>
    </div>
  );
}

function ActiveFileBrowser() {
  const [rootContents, setRootContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const sel_mod = localStorage.getItem('selectedModel');

  useEffect(() => {
    listDir()
      .then(contents => setRootContents(contents))
      .catch(err => console.error('Failed to load root directory:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto font-sans text-gray-800">
      <h1>{sel_mod}</h1>
      <h2 className="text-2xl font-semibold mb-4 flex items-center">
        📁 <span className="ml-2">Analysis Runs</span>
      </h2>

      {loading ? (
        <div className="text-gray-500">Loading directory...</div>
      ) : rootContents.length === 0 ? (
        <div className="text-gray-400">No files or folders found.</div>
      ) : (
        rootContents.map((entry, idx) =>
          entry.type === 'folder' ? (
            <RunRow key={idx} entry={entry} />
          ) : (
            <FileItem key={idx} name={entry.name} path={entry.path} />
          )
        )
      )}
    </div>
  );
}

export default ActiveFileBrowser;
