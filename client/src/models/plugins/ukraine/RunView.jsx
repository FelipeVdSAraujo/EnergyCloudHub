// client/src/models/plugins/ukraine/RunView.jsx
//
// Run control for the Ukraine FBMC model (plan task 3.3). Mirrors the gcam
// RunView anatomy:
//  - Run Ukraine model -> GET /ukraine/runModel/run-script (the request
//    awaits the whole run; progress streams meanwhile over SSE)
//  - /ukraine/runHistory/status on mount + a light 20 s poll back the SSE up
//  - /ukraine/runHistory/stream: init / line / status / end events
//  - 409 = blockedByOtherRun (global single-run lock, plan rule 5)
//  - reused:true = identical run already exists (run-signature hit)
// NOTE: unlike gcam, the server persists the Run doc itself (reliable
// server-side save, plan task 2.2) — this view must NOT POST /runHistory/save,
// which would create duplicate history entries.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchRunHistory, fetchRunStatus, openRunStream, runModel } from "./api";

const MAX_CLIENT_LINES = 400;

export default function RunView() {
  const streamRef = useRef(null);
  const outputRef = useRef(null);
  const [runName, setRunName] = useState(
    () => localStorage.getItem("ukraineCurrentRunName") || ""
  );
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reused, setReused] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);
  const [failure, setFailure] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    localStorage.setItem("ukraineCurrentRunName", runName);
  }, [runName]);

  const closeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  const appendOutputLine = useCallback((line) => {
    setOutput((prev) => {
      const lines = prev ? prev.split("\n") : [];
      lines.push(line);
      if (lines.length > MAX_CLIENT_LINES) {
        lines.splice(0, lines.length - MAX_CLIENT_LINES);
      }
      return lines.join("\n");
    });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const runs = await fetchRunHistory();
      setHistory(Array.isArray(runs) ? runs : []);
    } catch (error) {
      console.error("Failed to fetch run history", error);
    }
  }, []);

  const applyStatus = useCallback((status) => {
    if (!status) return;
    setIsRunning(Boolean(status.running));
    setBlocked(Boolean(status.blockedByOtherRun));
    setActiveRun(status.activeRun || null);
    if (Array.isArray(status.lines) && (status.running || status.lines.length > 0)) {
      setOutput(status.lines.join("\n"));
    }
  }, []);

  const startStream = useCallback(() => {
    if (streamRef.current) return;
    const token = localStorage.getItem("token");
    const stream = openRunStream(token);
    streamRef.current = stream;

    stream.addEventListener("init", (event) => {
      try {
        applyStatus(JSON.parse(event.data));
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

    stream.addEventListener("status", (event) => {
      try {
        applyStatus(JSON.parse(event.data));
      } catch (error) {
        /* transient status event — ignore */
      }
    });

    stream.addEventListener("end", () => {
      closeStream();
      loadHistory();
      fetchRunStatus().then(applyStatus).catch(() => {});
    });

    stream.onerror = () => closeStream();
  }, [appendOutputLine, applyStatus, closeStream, loadHistory]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchRunStatus();
      applyStatus(status);
      if (status?.running) {
        startStream();
      } else {
        closeStream();
      }
    } catch (error) {
      console.error("Failed to fetch run status", error);
    }
  }, [applyStatus, startStream, closeStream]);

  useEffect(() => {
    refreshStatus();
    loadHistory();
    const poll = setInterval(refreshStatus, 20000);
    return () => {
      clearInterval(poll);
      closeStream();
    };
  }, [refreshStatus, loadHistory, closeStream]);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  const handleRun = async () => {
    const name = runName.trim();
    if (!name) return;
    startStream();
    setSubmitting(true);
    setReused(null);
    setSuccessInfo(null);
    setFailure(null);
    try {
      const data = await runModel({ runName: name });
      if (data?.reused) {
        setReused(data.existingRun || {});
        if (data.output) setOutput(data.output);
      } else {
        setSuccessInfo(data);
        if (data?.output) setOutput(data.output);
      }
      await loadHistory();
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data || {};
      if (status === 409) {
        setFailure({
          message: data.message || "Another run is already in progress.",
          errors: [],
        });
      } else if (status === 400 && Array.isArray(data.errors)) {
        setFailure({
          message: "The active Ukraine config is invalid — fix it under Edit Config.",
          errors: data.errors,
        });
      } else {
        const details = data.details ? String(data.details).split("\n").slice(-6) : [];
        setFailure({ message: data.error || "Ukraine run failed", errors: details });
      }
    } finally {
      setSubmitting(false);
      refreshStatus();
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold mb-3">Run Ukraine FBMC</h2>
      <p className="text-sm text-gray-600 mb-6">
        Runs the active configuration on the compute box with Gurobi (HiGHS
        fallback). Measured: N-0 ≈ 3 min per window day, N-1 ≈ 24 min per
        window day — keep this tab open while the log streams.
      </p>

      {blocked && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Another model run is active
          {activeRun?.modelName ? ` (${activeRun.modelName})` : ""}
          {activeRun?.ownerUsername ? ` by ${activeRun.ownerUsername}` : ""}
          {activeRun?.runName ? `: ${activeRun.runName}` : ""}. Only one model
          run can execute at a time on this platform — try again once it
          finishes.
        </div>
      )}

      {reused && (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          An identical run already exists
          {reused.runName ? `: "${reused.runName}"` : ""}
          {reused.submittedAt
            ? ` (${String(reused.submittedAt).slice(0, 19).replace("T", " ")})`
            : ""}
          . Nothing was recomputed — see Results.
        </div>
      )}

      {successInfo && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Run completed: {successInfo.runName} — scenario {successInfo.scenario},
          run id <span className="font-mono text-xs">{successInfo.runId}</span>
          {successInfo.mode === "windows-remote" ? " (remote compute box)" : " (local)"}. See
          Results.
        </div>
      )}

      {failure && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">{failure.message}</p>
          {failure.errors?.length > 0 && (
            <ul className="list-disc ml-5 mt-1">
              {failure.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Run name</label>
          <input
            type="text"
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="my_ukraine_run"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          onClick={handleRun}
          disabled={!runName.trim() || submitting || isRunning || blocked}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting || isRunning ? "Running..." : "Run Ukraine model"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Live output</h3>
        <pre
          ref={outputRef}
          className="h-72 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs leading-5 whitespace-pre-wrap"
        >
          {output || "No output yet."}
        </pre>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Recent runs</h3>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">No runs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Run name</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Scenario</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((run) => (
                  <tr key={run._id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{run.runName}</td>
                    <td className="py-2 pr-4">
                      {run.submittedAt
                        ? String(run.submittedAt).slice(0, 19).replace("T", " ")
                        : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {run.selectedDatasetName || run.datasetName || "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {run.status === "success" ? (
                        <span className="text-green-700">
                          success{run.reused ? " (reused)" : ""}
                        </span>
                      ) : (
                        run.status || "-"
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
