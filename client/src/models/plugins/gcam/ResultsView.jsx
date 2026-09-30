import React, { useEffect, useState } from "react";
import { getDownloadUrl, listDir } from "./api";

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

  useEffect(() => {
    listDir("")
      .then((contents) => setRootContents(contents))
      .catch((error) => console.error("Failed to load GCAM results directory:", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto font-sans text-gray-800">
      <h2 className="text-2xl font-semibold mb-4">GCAM Results</h2>
      <p className="text-sm text-gray-600 mb-6">
        Browse run-specific folders created by the GCAM web runner.
      </p>

      {loading ? (
        <div className="text-gray-500">Loading directory...</div>
      ) : rootContents.length === 0 ? (
        <div className="text-gray-400">No files or folders found.</div>
      ) : (
        rootContents.map((entry, idx) =>
          entry.type === "folder" ? (
            <Folder key={idx} name={entry.name} path={entry.path} />
          ) : (
            <FileItem key={idx} name={entry.name} path={entry.path} />
          )
        )
      )}
    </div>
  );
}
