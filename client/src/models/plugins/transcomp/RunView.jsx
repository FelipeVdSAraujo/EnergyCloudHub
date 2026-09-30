import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchRunHistory,
  fetchRunStatus,
  getCurrentConfigSelection,
  getCurrentDatasetSelection,
  getDownloadUrl,
  openRunStream,
  runShellScript,
  saveRun,
} from "./api";

export default function RunView() {
  const streamRef = useRef(null);
  const outputRef = useRef(null);
  const [runName, setRunName] = useState("");
  const [shellOutput, setShellOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isBlockedByOtherRun, setIsBlockedByOtherRun] = useState(false);
  const [activeRunInfo, setActiveRunInfo] = useState(null);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [submittedRunName, setSubmittedRunName] = useState("");
  const [runHistory, setRunHistory] = useState([]);
  const [latestIamc, setLatestIamc] = useState(null);
  const [currentConfigName, setCurrentConfigName] = useState("Default");
  const [currentDatasetName, setCurrentDatasetName] = useState("Baseline");
  const maxClientLines = 40;

  const loadCurrentConfigSelection = async () => {
    try {
      const data = await getCurrentConfigSelection();
      if (data?.optimizer) {
        setCurrentConfigName(`Custom (${data.optimizer})`);
      }
    } catch (error) {
      console.error("Failed to fetch current config selection", error);
    }
  };

  const loadCurrentDatasetSelection = async () => {
    try {
      const data = await getCurrentDatasetSelection();
      if (data?.displayName) {
        setCurrentDatasetName(data.displayName);
      }
    } catch (error) {
      console.error("Failed to fetch current dataset selection", error);
    }
  };

  const loadRunHistory = async () => {
    try {
      const data = await fetchRunHistory();
      const runs = Array.isArray(data) ? data : [];
      setRunHistory(runs);
      if (runs.length > 0) {
        const latest = runs[0];
        setLatestIamc({
          status: latest?.iamcStatus || null,
          details: latest?.iamcDetails || null,
          file: latest?.iamcFile || null,
          validationPassed: Boolean(latest?.iamcValidationPassed),
        });
      }
    } catch (error) {
      console.error("Failed to fetch run history", error);
    }
  };

  const closeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  const appendOutputLine = useCallback((line) => {
    setShellOutput((prev) => {
      const lines = prev ? prev.split("\n") : [];
      lines.push(line);
      if (lines.length > maxClientLines) {
        lines.splice(0, lines.length - maxClientLines);
      }
      return lines.join("\n");
    });
  }, []);

  const startStream = useCallback(() => {
    if (streamRef.current) return;
    const token = localStorage.getItem("token");
    const stream = openRunStream(token);
    streamRef.current = stream;

    stream.addEventListener("init", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data?.lines) && (data?.running || data.lines.length > 0)) {
          setShellOutput(data.lines.join("\n"));
        }
      } catch (error) {
        console.error("Failed to parse init stream data", error);
      }
    });

    stream.addEventListener("line", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.line) {
          appendOutputLine(data.line);
        }
      } catch (error) {
        console.error("Failed to parse stream line", error);
      }
    });

    stream.addEventListener("end", () => {
      closeStream();
    });

    stream.onerror = () => {
      closeStream();
    };
  }, [appendOutputLine, closeStream]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchRunStatus();
      if (typeof status?.running === "boolean") {
        setIsRunning(status.running);
      }
      setIsBlockedByOtherRun(Boolean(status?.blockedByOtherRun));
      setActiveRunInfo(status?.activeRun || null);
      if (Array.isArray(status?.lines) && (status?.running || status.lines.length > 0)) {
        setShellOutput(status.lines.join("\n"));
      }
      if (status?.running) {
        startStream();
      } else {
        closeStream();
      }
    } catch (error) {
      console.error("Failed to fetch run status", error);
    }
  }, [startStream, closeStream]);

  useEffect(() => {
    setRunName(localStorage.getItem("currentRunName") || "");
    setSubmittedRunName(localStorage.getItem("submittedRunName") || "");
    setShellOutput(localStorage.getItem("shellOutput") || "");
    setSubmittedAt(localStorage.getItem("submittedAt") || null);
    loadRunHistory();
    refreshStatus();
    loadCurrentConfigSelection();
    loadCurrentDatasetSelection();

    return () => {
      closeStream();
    };
  }, [refreshStatus, closeStream]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [shellOutput]);

  const runScript = async () => {
    if (!runName || isRunning || isBlockedByOtherRun) return;

    const cleanRunName = runName.replaceAll(" ", "_");
    closeStream();
    setIsRunning(true);
    setShellOutput("");
    localStorage.setItem("currentRunName", cleanRunName);

    try {
      const runPromise = runShellScript(cleanRunName);
      startStream();
      const res = await runPromise;

      const output = res?.output || "Run completed.";
      const iamc = res?.iamc || null;
      setShellOutput(output);
      localStorage.setItem("shellOutput", output);
      setLatestIamc(iamc);

      const submissionTime = new Date().toLocaleString();
      await saveRun({
        modelName: "transcomp",
        runName: cleanRunName,
        submittedAt: submissionTime,
        shellOutput: output,
        selectedDatasetName: currentDatasetName,
        configId: currentConfigName,
        iamcStatus: iamc?.status || "unknown",
        iamcDetails: iamc?.message || "IAMC conversion status unavailable",
        iamcFile: iamc?.relativePath || null,
        iamcValidationPassed: Boolean(iamc?.validationPassed),
      });

      setSubmittedAt(submissionTime);
      setSubmittedRunName(cleanRunName);
      localStorage.setItem("submittedAt", submissionTime);
      localStorage.setItem("submittedRunName", cleanRunName);
      await loadRunHistory();
    } catch (error) {
      if (error?.response?.status === 409) {
        const active = error?.response?.data?.current;
        if (active) {
          setActiveRunInfo(active);
          setIsBlockedByOtherRun(true);
        }
        setShellOutput("Another TransComp run is already in progress.");
      } else {
        console.error(error);
        setShellOutput(error?.response?.data?.details || "Error running TransComp script");
      }
    } finally {
      setIsRunning(false);
      refreshStatus();
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold mb-3">Run TransComp</h2>
      <p className="text-sm text-gray-600 mb-6">
        Current config: <strong>{currentConfigName}</strong>. Current dataset: <strong>{currentDatasetName}</strong>.
      </p>

      {isBlockedByOtherRun && activeRunInfo && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Another run is active{activeRunInfo.runName ? `: ${activeRunInfo.runName}` : ""}.
        </div>
      )}

      <div className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Run name</label>
          <input
            type="text"
            placeholder="Enter a name for this run"
            value={runName}
            onChange={(e) => {
              setRunName(e.target.value);
              localStorage.setItem("currentRunName", e.target.value);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          onClick={runScript}
          disabled={!runName || isRunning || isBlockedByOtherRun}
          className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {isRunning ? "Running..." : "Run model"}
        </button>
      </div>

      {submittedAt && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Last run "{submittedRunName}" submitted at {submittedAt}.
        </div>
      )}

      {latestIamc?.status && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="font-semibold">IAMC Conversion: {latestIamc.status}</div>
          {latestIamc.details && <div className="mt-1">{latestIamc.details}</div>}
          {latestIamc.file && (
            <div className="mt-2">
              <a
                href={getDownloadUrl(latestIamc.file)}
                className="font-medium text-blue-700 underline hover:text-blue-900"
              >
                Download transcomp_iamc.csv
              </a>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">Output</h3>
          <pre
            ref={outputRef}
            className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm text-emerald-300"
          >
            {shellOutput || "Run output will appear here."}
          </pre>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">Recent runs</h3>
          {runHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No runs yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {runHistory.map((run) => (
                <li key={run._id} className="rounded-lg border bg-gray-50 p-3">
                  <div className="font-medium">{run.runName}</div>
                  <div className="text-gray-600">{run.submittedAt || "Unknown time"}</div>
                  {run.selectedDatasetName && <div className="text-gray-600">Dataset: {run.selectedDatasetName}</div>}
                  {run.iamcStatus && <div className="text-gray-600">IAMC: {run.iamcStatus}</div>}
                  {run.iamcFile && (
                    <div>
                      <a
                        href={getDownloadUrl(run.iamcFile)}
                        className="text-blue-700 underline hover:text-blue-900"
                      >
                        Download IAMC CSV
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}