import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchRunHistory, fetchRunStatus, openRunStream, runShellScript, saveRun } from "./api";

export default function RunPage() {
  const streamRef = useRef(null);
  const outputRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [runName, setRunName] = useState("");
  const [submittedRunName, setSubmittedRunName] = useState("");
  const [shellOutput, setShellOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isBlockedByOtherRun, setIsBlockedByOtherRun] = useState(false);
  const [activeRunInfo, setActiveRunInfo] = useState(null);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const maxClientLines = 40;

  const loadRunHistory = async () => {
    try {
      const data = await fetchRunHistory();
      setRunHistory(data);
      if (Array.isArray(data) && data.length > 0) {
        setSubmittedRunName(data[0]?.runName || "");
        setSubmittedAt(data[0]?.submittedAt || null);
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
        if (Array.isArray(data?.lines) && data?.running) {
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
      if (Array.isArray(status?.lines)) {
        setShellOutput(status.lines.join("\n"));
      }
      if (status?.running) startStream();
      else closeStream();
    } catch (error) {
      console.error("Failed to fetch run status", error);
    }
  }, [startStream, closeStream]);

  useEffect(() => {
    const model = localStorage.getItem("activeModelId");
    setSelectedModel(model || "");
    setRunName(localStorage.getItem("currentRunName") || "");
    setSubmittedRunName(localStorage.getItem("submittedRunName") || "");
    setShellOutput(localStorage.getItem("shellOutput") || "");
    setSubmittedAt(localStorage.getItem("submittedAt") || null);

    loadRunHistory();
    refreshStatus();
    return () => closeStream();
  }, [refreshStatus, closeStream]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [shellOutput]);

  const runScript = async () => {
    if (!selectedModel || !runName || isBlockedByOtherRun) return;

    const cleanRunName = runName.replaceAll(" ", "_");
    closeStream();
    setIsRunning(true);
    setShellOutput("");
    localStorage.setItem("currentRunName", cleanRunName);

    try {
      const runPromise = runShellScript(selectedModel, cleanRunName);
      startStream();
      const res = await runPromise;

      setShellOutput(res.output);
      localStorage.setItem("shellOutput", res.output);

      const submissionTime = new Date().toLocaleString();
      const runInfo = {
        modelName: selectedModel,
        runName: cleanRunName,
        submittedAt: submissionTime,
        shellOutput: res.output
      };

      await saveRun(runInfo);

      setSubmittedAt(submissionTime);
      setSubmittedRunName(cleanRunName);
      localStorage.setItem("submittedAt", submissionTime);
      localStorage.setItem("submittedRunName", cleanRunName);

      loadRunHistory();
    } catch (error) {
      if (error?.response?.status === 409) {
        const active = error?.response?.data?.current;
        if (active) {
          setActiveRunInfo(active);
          setIsBlockedByOtherRun(active?.modelName !== selectedModel);
        }
        setShellOutput("Another run is already in progress.");
      } else {
        console.error(error);
        setShellOutput("Error running EMX script");
      }
    } finally {
      setIsRunning(false);
      refreshStatus();
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto mt-10 font-sans text-gray-800">
      <h2 className="text-3xl font-bold mb-4 text-center">Run Model: {selectedModel}</h2>
      <p className="text-sm text-gray-600 mb-6 text-center">
        This uses the saved EMX config to create a run-specific results folder and launch the
        Julia model.
      </p>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Enter a name for this run"
          value={runName}
          onChange={(e) => {
            setRunName(e.target.value);
            localStorage.setItem("currentRunName", e.target.value);
          }}
          className="border rounded p-3 w-full text-lg"
        />
      </div>

      <div className="text-center mb-8">
        {isBlockedByOtherRun && activeRunInfo && (
          <p className="mb-3 text-sm text-gray-700 bg-gray-100 rounded p-2">
            Run is locked: {activeRunInfo.modelName} is running
            {activeRunInfo.runName ? ` ("${activeRunInfo.runName}")` : ""}.
          </p>
        )}
        <button
          onClick={runScript}
          disabled={!runName || isRunning || isBlockedByOtherRun}
          className={`px-6 py-3 text-lg rounded font-semibold transition ${
            !runName || isRunning || isBlockedByOtherRun
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white"
          }`}
        >
          {isRunning ? "Running..." : isBlockedByOtherRun ? "Unavailable" : "Run"}
        </button>
      </div>

      {submittedAt && (
        <div className="mb-6 text-center">
          <p className="text-green-700 font-medium">
            Last run "{submittedRunName}" submitted at: {submittedAt}
          </p>
          <p className="text-gray-600 mt-2">
            Results will be written to the EMX results directory and appear in the Results tab.
          </p>
        </div>
      )}

      {shellOutput && (
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-700">Output</h3>
          <pre
            ref={outputRef}
            className="bg-gray-900 text-green-300 p-4 rounded overflow-x-auto max-h-[400px] whitespace-pre-wrap text-sm"
          >
            {shellOutput}
          </pre>
        </div>
      )}

      {runHistory.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Run History</h3>
          <ul className="space-y-4">
            {runHistory.map((run, index) => (
              <li key={index} className="border rounded p-4 bg-gray-50">
                <p className="font-semibold">{run.runName}</p>
                <p className="text-sm text-gray-600">{run.submittedAt}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
