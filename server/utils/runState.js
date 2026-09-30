const MAX_LINES = 40;

const runStatesByModel = new Map();
const subscribersByModel = new Map();
let activeRunModelKey = null;

function getModelKey(modelName) {
  return modelName || "default";
}

function createEmptyState(modelName) {
  return {
    isRunning: false,
    modelName: modelName || null,
    runName: null,
    ownerId: null,
    ownerUsername: null,
    lines: [],
    exitCode: null,
    startedAt: null
  };
}

function getModelState(modelName) {
  const key = getModelKey(modelName);
  if (!runStatesByModel.has(key)) {
    runStatesByModel.set(key, createEmptyState(modelName));
  }
  return runStatesByModel.get(key);
}

function getActiveRunSummary() {
  if (!activeRunModelKey) return null;
  const activeState = getModelState(activeRunModelKey);
  if (!activeState.isRunning) return null;
  return {
    modelName: activeState.modelName,
    runName: activeState.runName,
    ownerId: activeState.ownerId,
    ownerUsername: activeState.ownerUsername,
    startedAt: activeState.startedAt
  };
}

function getSubscribers(modelName) {
  const key = getModelKey(modelName);
  if (!subscribersByModel.has(key)) {
    subscribersByModel.set(key, new Set());
  }
  return subscribersByModel.get(key);
}

function broadcast(modelName, event, payload) {
  const data = JSON.stringify(payload);
  for (const res of getSubscribers(modelName)) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  }
}

export function getStatus(modelName) {
  const modelKey = getModelKey(modelName);
  const runState = getModelState(modelName);
  const activeRun = getActiveRunSummary();
  return {
    running: runState.isRunning,
    modelName: runState.modelName,
    runName: runState.runName,
    lines: [...runState.lines],
    exitCode: runState.exitCode,
    startedAt: runState.startedAt,
    activeRun,
    blockedByOtherRun: Boolean(activeRun) && activeRunModelKey !== modelKey
  };
}

export function tryStartRun(modelName, runName, owner = null) {
  const modelKey = getModelKey(modelName);

  if (activeRunModelKey) {
    const activeState = getModelState(activeRunModelKey);
    return {
      ok: false,
      current: {
        modelName: activeState.modelName,
        runName: activeState.runName,
        ownerId: activeState.ownerId,
        ownerUsername: activeState.ownerUsername,
      }
    };
  }

  const runState = getModelState(modelName);

  runState.isRunning = true;
  runState.modelName = modelName || null;
  runState.runName = runName || null;
  runState.ownerId = owner?.ownerId || null;
  runState.ownerUsername = owner?.ownerUsername || null;
  runState.lines = [];
  runState.exitCode = null;
  runState.startedAt = new Date().toISOString();
  activeRunModelKey = modelKey;

  broadcast(modelName, "status", getStatus(modelName));

  return { ok: true };
}

export function appendLine(modelName, line) {
  const runState = getModelState(modelName);
  if (!runState.isRunning) return;

  runState.lines.push(line);
  if (runState.lines.length > MAX_LINES) {
    runState.lines.splice(0, runState.lines.length - MAX_LINES);
  }

  broadcast(modelName, "line", { line });
}

export function endRun(modelName, exitCode) {
  const runState = getModelState(modelName);
  runState.isRunning = false;
  runState.exitCode = exitCode;
  runState.ownerId = null;
  runState.ownerUsername = null;
  if (activeRunModelKey === getModelKey(modelName)) {
    activeRunModelKey = null;
  }

  broadcast(modelName, "end", { exitCode });
  broadcast(modelName, "status", getStatus(modelName));
}

export function addSubscriber(modelName, res) {
  const subscribers = getSubscribers(modelName);
  subscribers.add(res);
  res.on("close", () => subscribers.delete(res));
}
