import api, { API_BASE } from "../../../api";

export function getConfig() {
  return api.get("/gcam/config").then((res) => res.data);
}

export function saveConfig(config) {
  return api.put("/gcam/config", config).then((res) => res.data);
}

export function resetConfig() {
  return api.post("/gcam/config/reset").then((res) => res.data);
}

export function fetchRunHistory() {
  return api.get("/gcam/runHistory/history").then((res) => res.data);
}

export function fetchRunStatus() {
  return api.get("/gcam/runHistory/status").then((res) => res.data);
}

export function openRunStream(token) {
  const baseUrl = api.defaults.baseURL || "/api";
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${baseUrl}/gcam/runHistory/stream${qs}`);
}

export function runShellScript(runName, scenarioName) {
  const params = { runName };
  if (scenarioName) params.scenarioName = scenarioName;
  return api.get("/gcam/runModel/run-script", {
    params,
  }).then((res) => res.data);
}

export function saveRun(runInfo) {
  return api.post("/gcam/runHistory/save", runInfo);
}

export function listDir(path = "") {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return api.get(`/gcam/results/list-dir${query}`).then((res) => res.data.contents);
}

export function getDownloadUrl(path) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/gcam/results/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}
