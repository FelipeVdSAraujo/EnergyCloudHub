// client/src/models/plugins/ukraine/api.js
//
// Axios wrappers for the Ukraine FBMC server routes (plan tasks 2.1-2.3,
// consumed by the client plugin — plan task 3.1). Mirrors the gcam plugin:
//  - every request goes through the shared axios instance (Bearer token)
//  - the SSE stream is an EventSource; EventSource cannot set headers, so
//    the token travels as ?token= (requireAuth accepts it)

import api, { API_BASE } from "../../../api";

// ---- config (task 3.2 — all metadata comes from the server) ----

export function getConfig() {
  return api.get("/ukraine/config").then((res) => res.data);
}

export function validateConfig(content) {
  return api.post("/ukraine/config/validate", content).then((res) => res.data);
}

export function saveConfig(fileName, content) {
  return api
    .put("/ukraine/config", { fileName, mimeType: "application/x-yaml", content })
    .then((res) => res.data);
}

export function selectConfig(configId) {
  return api.post("/ukraine/config/select", { configId }).then((res) => res.data);
}

export function fetchUserConfigs() {
  return api.get("/ukraine/config/user_configs").then((res) => res.data.configs);
}

export function resetConfig() {
  return api.post("/ukraine/config/reset").then((res) => res.data);
}

// ---- run control (task 3.3) ----

export function runModel({ runName, configId, forceRerun } = {}) {
  const params = { runName: runName || "" };
  if (configId) params.configId = configId;
  if (forceRerun) params.forceRerun = "true";
  return api.get("/ukraine/runModel/run-script", { params }).then((res) => res.data);
}

export function fetchRunStatus() {
  return api.get("/ukraine/runHistory/status").then((res) => res.data);
}

export function fetchRunHistory() {
  return api.get("/ukraine/runHistory/history").then((res) => res.data);
}

// EventSource cannot set headers; requireAuth accepts ?token=.
export function openRunStream(token) {
  const baseUrl = api.defaults.baseURL || "/api";
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${baseUrl}/ukraine/runHistory/stream${qs}`);
}

// ---- results (task 3.4) ----

export function fetchRuns() {
  return api.get("/ukraine/results/runs").then((res) => res.data.runs);
}

export function fetchKpis(runId) {
  return api.get("/ukraine/results/kpis", { params: { run: runId } }).then((res) => res.data);
}

export function fetchMeta(runId) {
  return api.get("/ukraine/results/meta", { params: { run: runId } }).then((res) => res.data);
}

// Inline fetch of one slim web-profile file (CSV) for client-side parsing.
export function fetchRunFileText(runId, file) {
  return api
    .get("/ukraine/results/download", { params: { run: runId, file, inline: "1" } })
    .then((res) => res.data);
}

// Attachment URL for a plain window.open (token in the query string).
export function getDownloadUrl(runId, file) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/ukraine/results/download?run=${encodeURIComponent(
    runId
  )}&file=${encodeURIComponent(file)}&token=${encodeURIComponent(token)}`;
}
