import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchRunHistory,
  fetchRunStatus,
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
  const maxClientLines = 40;

  const loadRunHistory = async () => {
    try {
      const data = await fetchRunHistory();
      setRunHistory(Array.isArray(data) ? data : []);
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
        if (data?.line) appendOutputLine(data.line);
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
    setRunName(localStorage.getItem("gcamCurrentRunName") || "");
    setSubmittedRunName(localStorage.getItem("gcamSubmittedRunName") || "");
    setShellOutput(localStorage.getItem("gcamShellOutput") || "");
    setSubmittedAt(localStorage.getItem("gcamSubmittedAt") || null);
    loadRunHistory();
    refreshStatus();

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
    localStorage.setItem("gcamCurrentRunName", cleanRunName);

    try {
      const runPromise = runShellScript(cleanRunName);
      startStream();
      const res = await runPromise;

      const output = res?.output || "Run completed.";
      setShellOutput(output);
      localStorage.setItem("gcamShellOutput", output);

      const submissionTime = new Date().toLocaleString();
      await saveRun({
        modelName: "gcam",
        runName: cleanRunName,
        submittedAt: submissionTime,
        shellOutput: output,
        selectedDatasetName: "N/A",
        configId: cleanRunName,
      });

      setSubmittedAt(submissionTime);
      setSubmittedRunName(cleanRunName);
      localStorage.setItem("gcamSubmittedAt", submissionTime);
      localStorage.setItem("gcamSubmittedRunName", cleanRunName);
      await loadRunHistory();
    } catch (error) {
      if (error?.response?.status === 409) {
        const active = error?.response?.data?.current;
        if (active) {
          setActiveRunInfo(active);
          setIsBlockedByOtherRun(true);
        }
        setShellOutput("Another model run is already in progress.");
      } else {
        console.error(error);
        setShellOutput(error?.response?.data?.details || "Error running GCAM script");
      }
    } finally {
      setIsRunning(false);
      refreshStatus();
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold mb-3">Run GCAM</h2>
      <p className="text-sm text-gray-600 mb-6">
        The run name is used as the GCAM scenario name for this run.
      </p>

      {isBlockedByOtherRun && activeRunInfo && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Another run is active{activeRunInfo.runName ? `: ${activeRunInfo.runName}` : ""}.
        </div>
      )}

      <div className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Run name</label>
          <input
            type="text"
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="my_gcam_run"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          onClick={runScript}
          disabled={!runName || isRunning || isBlockedByOtherRun}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run GCAM"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Live output</h3>
        <pre
          ref={outputRef}
          className="h-72 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs leading-5"
        >
          {shellOutput || "No output yet."}
        </pre>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Recent runs</h3>
        {runHistory.length === 0 ? (
          <div className="text-sm text-gray-500">No runs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Run name</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Scenario</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.slice(0, 20).map((run) => (
                  <tr key={run._id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{run.runName}</td>
                    <td className="py-2 pr-4">{run.submittedAt || "-"}</td>
                    <td className="py-2 pr-4">{run.configId || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(submittedAt || submittedRunName) && (
          <div className="mt-4 text-xs text-gray-500">
            Last submitted: {submittedRunName || "-"} {submittedAt ? `at ${submittedAt}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
