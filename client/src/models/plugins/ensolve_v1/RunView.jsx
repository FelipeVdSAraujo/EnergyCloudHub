import React, { useCallback, useState, useEffect, useRef } from 'react';
import { fetchRunHistory, fetchRunStatus, getCurrentConfigSelection, getCurrentDatasetSelection, openRunStream, runShellScript } from './api';

/**
 * frnt_run_model.js
 * 
 * RunPage component for submitting and tracking model runs in the EnSolve platform.
 * 
 * Features:
 * - Allows users to enter a run name and submit a model run to the backend.
 * - Displays real-time shell output from the backend during execution.
 * - Shows the time of the last submitted run and a history of previous runs.
 * - Persists run name and output in localStorage for session continuity.
 * - Uses Tailwind CSS classes for layout and styling.
 * 
 * State:
 * - selectedModel: Currently selected model for the run.
 * - runName: Name for the current run.
 * - shellOutput: Output from the backend shell script.
 * - isRunning: Whether a run is currently in progress.
 * - submittedAt: Timestamp of the last run submission.
 * - runHistory: List of previous runs with details and output.
 * 
 * Uses:
 * - fetchRunHistory: Fetches history of previous runs from backend.
 * - runShellScript: Submits a new run to the backend.
 * Exports:
 * - RunPage: React functional component for the run model page.
 */

const RunPage = () => {
  const streamRef = useRef(null);
  const outputRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [runName, setRunName] = useState('');
  const [submittedRunName, setSubmittedRunName] = useState('');
  const [shellOutput, setShellOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlockedByOtherRun, setIsBlockedByOtherRun] = useState(false);
  const [activeRunOwnedByCurrentUser, setActiveRunOwnedByCurrentUser] = useState(false);
  const [activeRunInfo, setActiveRunInfo] = useState(null);
  const [runConflictMessage, setRunConflictMessage] = useState('');
  const [submittedAt, setSubmittedAt] = useState(null);
  const [lastRunWasDuplicate, setLastRunWasDuplicate] = useState(false);
  const [showRequestAcknowledgement, setShowRequestAcknowledgement] = useState(false);
  const [duplicateRunName, setDuplicateRunName] = useState('');
  const [runHistory, setRunHistory] = useState([]);
  const [currentConfigName, setCurrentConfigName] = useState('Test_Run');
  const [currentDatasetName, setCurrentDatasetName] = useState('Baseline');
  const maxClientLines = 40;

  const loadCurrentConfigSelection = async () => {
    try {
      const data = await getCurrentConfigSelection();
      if (data?.displayName) {
        setCurrentConfigName(data.displayName);
      }
      if (data?.configId) {
        localStorage.setItem('selectedEmpireConfigId', String(data.configId));
      } else {
        localStorage.removeItem('selectedEmpireConfigId');
      }
    } catch (error) {
      console.error('Failed to fetch current config selection', error);
    }
  };

  const loadCurrentDatasetSelection = async () => {
    try {
      const data = await getCurrentDatasetSelection();
      if (data?.displayName) {
        setCurrentDatasetName(data.displayName);
      }
    } catch (error) {
      console.error('Failed to fetch current dataset selection', error);
    }
  };

  const loadRunHistory = async (hydrateLastRun = false) => {
    try {
      const data = await fetchRunHistory();
      setRunHistory(data);
      if (hydrateLastRun && Array.isArray(data) && data.length > 0) {
        setSubmittedRunName(data[0]?.runName || '');
        setSubmittedAt(data[0]?.submittedAt || null);
      }
    } catch (error) {
      console.error('Failed to fetch run history', error);
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
      const lines = prev ? prev.split('\n') : [];
      lines.push(line);
      if (lines.length > maxClientLines) {
        lines.splice(0, lines.length - maxClientLines);
      }
      return lines.join('\n');
    });
  }, []);

  const startStream = useCallback(() => {
    if (streamRef.current) return;
    const token = localStorage.getItem('token');
    const stream = openRunStream(token);
    streamRef.current = stream;

    stream.addEventListener('init', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data?.lines) && data?.running) {
          setShellOutput(data.lines.join('\n'));
        }
      } catch (error) {
        console.error('Failed to parse init stream data', error);
      }
    });

    stream.addEventListener('line', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.line) {
          appendOutputLine(data.line);
        }
      } catch (error) {
        console.error('Failed to parse stream line', error);
      }
    });

    stream.addEventListener('end', () => {
      closeStream();
    });

    stream.onerror = () => {
      closeStream();
    };
  }, [appendOutputLine, closeStream]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchRunStatus();
      if (typeof status?.running === 'boolean') {
        setIsRunning(status.running);
      }
      const ownedByCurrentUser = Boolean(status?.activeRunOwnedByCurrentUser);
      setActiveRunOwnedByCurrentUser(ownedByCurrentUser);
      setIsBlockedByOtherRun(Boolean(status?.running) && !ownedByCurrentUser);
      setActiveRunInfo(status?.activeRun || null);
      if (Array.isArray(status?.lines)) {
        setShellOutput(status.lines.join('\n'));
      }
      if (status?.running) {
        startStream();
      } else {
        closeStream();
      }
    } catch (error) {
      console.error('Failed to fetch run status', error);
    }
  }, [startStream, closeStream]);

  useEffect(() => {
    const model = localStorage.getItem('activeModelId');
    const savedRunName = localStorage.getItem('currentRunName');
    const savedSubmittedRunName = localStorage.getItem('submittedRunName');
    const savedShellOutput = localStorage.getItem('shellOutput');
    const savedSubmittedAt = localStorage.getItem('submittedAt');
    const savedDuplicateRunName = localStorage.getItem('duplicateRunName');
    const savedLastRunWasDuplicate = localStorage.getItem('lastRunWasDuplicate') === 'true';

    setSelectedModel(model || '');
    setRunName(savedRunName || '');
    setSubmittedRunName(savedSubmittedRunName || '');
    setShellOutput(savedShellOutput || '');
    setSubmittedAt(savedSubmittedAt || null);
    setDuplicateRunName(savedDuplicateRunName || '');
    setLastRunWasDuplicate(savedLastRunWasDuplicate);
    setIsRunning(false);

    loadRunHistory(true);
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
    if (!selectedModel || !runName || isSubmitting || isBlockedByOtherRun) return;

    const cleanRunName = runName.replaceAll(" ", "_");
    const selectedConfigId = localStorage.getItem("selectedEmpireConfigId") || undefined;
    const requestReceivedAt = new Date().toLocaleString();
    let duplicateDetected = false;

    closeStream();
    setIsSubmitting(true);
    setShellOutput('');
    setShowRequestAcknowledgement(true);
    setRunConflictMessage('');
    setSubmittedRunName(cleanRunName);
    setSubmittedAt(requestReceivedAt);
    setLastRunWasDuplicate(false);
    setDuplicateRunName('');

    localStorage.setItem('currentRunName', cleanRunName);

    try {
      const runPromise = runShellScript(selectedModel, cleanRunName, selectedConfigId);
      startStream();
      const res = await runPromise;

      if (res?.reused && res?.existingRun) {
        duplicateDetected = true;
        closeStream();
        const reusedOutput = res.output || `Identical run already exists: "${res.existingRun.runName}".`;
        setShellOutput(reusedOutput);
        localStorage.setItem('shellOutput', reusedOutput);

        const existingDuplicateRunName = res.existingRun.runName || cleanRunName;

        setLastRunWasDuplicate(true);
        setDuplicateRunName(existingDuplicateRunName);

        localStorage.setItem('submittedRunName', cleanRunName);
        localStorage.setItem('submittedAt', requestReceivedAt);
        localStorage.setItem('lastRunWasDuplicate', 'true');
        localStorage.setItem('duplicateRunName', existingDuplicateRunName);

        loadRunHistory();
        loadCurrentConfigSelection();
        loadCurrentDatasetSelection();
        return;
      }

      setShellOutput(res.output);
      localStorage.setItem('shellOutput', res.output);

      // Run is saved server-side on close; no client saveRun call needed.
      const submissionTime = new Date().toLocaleString();

      setSubmittedAt(submissionTime);
      setSubmittedRunName(cleanRunName);
      setLastRunWasDuplicate(false);
      setDuplicateRunName('');
      setShowRequestAcknowledgement(false);
      localStorage.setItem('submittedAt', submissionTime);
      localStorage.setItem('submittedRunName', cleanRunName);
      localStorage.setItem('lastRunWasDuplicate', 'false');
      localStorage.removeItem('duplicateRunName');

      loadRunHistory(true);
      loadCurrentConfigSelection();
      loadCurrentDatasetSelection();
    } catch (error) {
      if (error?.response?.status === 409) {
        const active = error?.response?.data?.current;
        if (active) {
          setActiveRunInfo(active);
          setIsBlockedByOtherRun(true);
          setActiveRunOwnedByCurrentUser(false);
        }
        const conflictMessage = error?.response?.data?.message
          || `Your run was not started because ${active?.ownerUsername || 'another user'} is already running${active?.runName ? ` "${active.runName}"` : ''}.`;
        const errorMsg = conflictMessage;
        setRunConflictMessage(conflictMessage);
        setShellOutput(errorMsg);
        localStorage.setItem('shellOutput', errorMsg);
        setShowRequestAcknowledgement(false);
      } else {
        console.error(error);
        const errorMsg = 'Error running script';
        setShellOutput(errorMsg);
        localStorage.setItem('shellOutput', errorMsg);
        setShowRequestAcknowledgement(false);
      }
    } finally {
      setIsSubmitting(false);
      if (!duplicateDetected) {
        setShowRequestAcknowledgement(false);
      }
      refreshStatus();
    }
  };

  const disableRunButton =
    !runName
    || isSubmitting
    || isBlockedByOtherRun
    || (isRunning && activeRunOwnedByCurrentUser);

  return (
    <div className="p-6 max-w-3xl mx-auto mt-10 font-sans text-gray-800">
      <h2 className="text-3xl font-bold mb-4 text-center">Run Model: {selectedModel}</h2>

      <div className="mb-6 text-center">
        <p className="text-sm text-gray-700 mb-1">
          Config: <strong>{currentConfigName}</strong>
        </p>
        <p className="text-sm text-gray-700">
          Dataset: <strong>{currentDatasetName}</strong>
        </p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Enter a name for this run"
          value={runName}
          onChange={(e) => {
            setRunName(e.target.value);
            localStorage.setItem('currentRunName', e.target.value);
          }}
          className="border rounded p-3 w-full text-lg"
        />
      </div>

      <div className="text-center mb-8">
        {isBlockedByOtherRun && activeRunInfo && (
          <p className="mb-3 text-sm text-gray-700 bg-gray-100 rounded p-2">
            Run currently in progress by <strong>{activeRunInfo.ownerUsername || 'another user'}</strong>
            {activeRunInfo.runName ? ` ("${activeRunInfo.runName}")` : ''}.
          </p>
        )}
        {runConflictMessage && (
          <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {runConflictMessage}
          </p>
        )}
        <button
          onClick={runScript}
          disabled={disableRunButton}
          className={`px-6 py-3 text-lg rounded font-semibold transition ${
            disableRunButton
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isSubmitting || (isRunning && activeRunOwnedByCurrentUser)
            ? 'Running...'
            : isBlockedByOtherRun
              ? 'Unavailable'
              : 'Run'}
        </button>
      </div>

      {submittedAt && (
        <div className="mb-6 text-center">
          <p className="text-green-700 font-medium">
            {showRequestAcknowledgement || lastRunWasDuplicate
              ? `Run request "${submittedRunName}" received at: ${submittedAt}.`
              : `Last run "${submittedRunName}" submitted at: ${submittedAt}`}
          </p>
          <p className="text-gray-600 mt-2">
            {lastRunWasDuplicate ? (
              <span>
                The input of this run matches exactly a previously executed run that can be found in the <strong>Results</strong> tab under the name <strong>{duplicateRunName || submittedRunName}</strong>.
              </span>
            ) : (
              <span>Runs can take minutes or hours. Results will be available in the <strong>Results</strong> tab.</span>
            )}
          </p>
        </div>
      )}

      {shellOutput && (
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-700">Output:</h3>
          <pre ref={outputRef} className="bg-gray-900 text-green-300 p-4 rounded overflow-x-auto max-h-[400px] whitespace-pre-wrap text-sm">
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
                <p className="font-medium">🔹 {run.modelName} — "{run.runName}"</p>
                <p className="text-sm text-gray-600">Submitted at: {run.submittedAt}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600">Show output</summary>
                  <pre className="bg-gray-900 text-green-300 p-2 rounded overflow-x-auto whitespace-pre-wrap text-sm mt-2">
                    {run.shellOutput}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RunPage;
