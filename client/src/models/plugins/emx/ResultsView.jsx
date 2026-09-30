import React, { useEffect, useState } from "react";
import { fetchIamcExport, getDownloadUrl, listDir } from "./api";

const WEB_RUNS_ROOT = "web_runs";

async function parseIamcApiError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;

  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return {
        status,
        message: parsed?.details || parsed?.error || text || "IAMC conversion failed",
      };
    } catch (_parseError) {
      return { status, message: "IAMC conversion failed" };
    }
  }

  return {
    status,
    message: data?.details || data?.error || error?.message || "IAMC conversion failed",
  };
}

function RunRow({ entry, onIamcError, onIamcSuccess }) {
  const [dlState, setDlState] = useState("idle"); // idle | loading | error | unavailable

  const handleIamcDownload = async () => {
    setDlState("loading");
    try {
      const res = await fetchIamcExport(entry.name, "EnergyModelsX v0.10");
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.name}_iamc.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onIamcSuccess?.();
      setDlState("idle");
    } catch (error) {
      const { status, message } = await parseIamcApiError(error);
      onIamcError?.(message);
      setDlState(status === 404 ? "unavailable" : "error");
      setTimeout(() => setDlState("idle"), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="flex-1">
        <Folder name={entry.name} path={entry.path} />
      </div>
      <button
        onClick={handleIamcDownload}
        disabled={dlState === "loading"}
        className="shrink-0 px-2 py-0.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition"
        title="Download IAMC-format XLSX for this EMX run"
      >
        {dlState === "loading"
          ? "Preparing..."
          : dlState === "unavailable"
            ? "No IAMC data"
            : dlState === "error"
              ? "Error"
              : "IAMC"}
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
      } catch (error) {
        console.error("Error loading folder:", error);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="ml-4">
      <div className="flex items-center cursor-pointer hover:text-blue-600 transition" onClick={toggleFolder}>
        <span className="mr-2 text-xl">{expanded ? "📂" : "📁"}</span>
        <span className="font-medium">{name}</span>
        {loading ? <span className="ml-2 text-sm text-gray-500">Loading...</span> : null}
      </div>
      {expanded && (
        <div className="mt-1">
          {children.length === 0 ? (
            <div className="ml-6 text-sm italic text-gray-500">Empty folder</div>
          ) : (
            children.map((child, idx) =>
              child.type === "folder" ? (
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
  return (
    <div className="ml-8 flex items-center mt-1 group">
      <span className="text-sm text-gray-700 group-hover:text-blue-600 transition">{name}</span>
      <button
        onClick={() => window.open(getDownloadUrl(path), "_blank")}
        className="ml-3 px-2 py-0.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition"
      >
        Download
      </button>
    </div>
  );
}

export default function ResultsView() {
  const [rootContents, setRootContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState("");

  useEffect(() => {
    listDir(WEB_RUNS_ROOT)
      .then((contents) => setRootContents(contents))
      .catch((error) => console.error("Failed to load EMX web_runs directory:", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto font-sans text-gray-800">
      <h2 className="text-2xl font-semibold mb-4">EMX Results</h2>
      {errorBanner ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <div className="flex items-start justify-between gap-3">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner("")}
              className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <p className="text-sm text-gray-600 mb-6">
        Browse run-specific folders created from the web UI under results/web_runs. Generated
        dispatch HTML files and requested configs are stored per run here.
      </p>

      {loading ? (
        <div className="text-gray-500">Loading directory...</div>
      ) : rootContents.length === 0 ? (
        <div className="text-gray-400">No files or folders found.</div>
      ) : (
        rootContents.map((entry, idx) =>
          entry.type === "folder" ? (
            <RunRow
              key={idx}
              entry={entry}
              onIamcError={(message) => setErrorBanner(message)}
              onIamcSuccess={() => setErrorBanner("")}
            />
          ) : (
            <FileItem key={idx} name={entry.name} path={entry.path} />
          )
        )
      )}
    </div>
  );
}
