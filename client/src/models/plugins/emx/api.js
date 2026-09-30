import api, { API_BASE } from "../../../api";

export function getConfig() {
  return api.get("/emx/config").then((res) => res.data);
}

export function resetConfig() {
  return api.post("/emx/config/reset");
}

export function saveConfig(config) {
  return api.put("/emx/config", config).then((res) => res.data);
}

export function listDir(path = "") {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return api.get(`/emx/results/list-dir${query}`).then((res) => res.data.contents);
}

export function getDownloadUrl(path) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/emx/results/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

export function fetchIamcExport(runName, modelName) {
  const params = { run: runName };
  if (modelName) params.modelName = modelName;
  return api.get("/emx/results/iamc-export", {
    params,
    responseType: "blob",
  });
}

export function fetchRunHistory() {
  return api.get("/emx/runHistory/history").then((res) => res.data);
}

export function fetchRunStatus() {
  return api.get("/emx/runHistory/status").then((res) => res.data);
}

export function openRunStream(token) {
  const baseUrl = api.defaults.baseURL || "/api";
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${baseUrl}/emx/runHistory/stream${qs}`);
}

export function runShellScript(model, runName) {
  return api.get("/emx/runModel/run-script", {
    params: { model, runName }
  }).then((res) => res.data);
}

export function saveRun(runInfo) {
  return api.post("/emx/runHistory/save", runInfo);
}
