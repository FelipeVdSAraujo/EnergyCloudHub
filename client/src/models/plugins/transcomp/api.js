import api, { API_BASE } from "../../../api";

export function getConfig() {
  return api.get("/transcomp/config").then((res) => res.data);
}

export function saveConfig(config) {
  return api.put("/transcomp/config", config).then((res) => res.data);
}

export function resetConfig() {
  return api.post("/transcomp/config/reset").then((res) => res.data);
}

export function getUploadedFiles() {
  return api.get("/transcomp/data/list-uploads").then((res) => res.data);
}

export function validateDataset() {
  return api.get("/transcomp/data/validate").then((res) => res.data);
}

export function uploadYamlFiles(formData) {
  return api.post("/transcomp/data/upload-yaml", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function resetUploads() {
  return api.post("/transcomp/data/reset-uploads");
}

export function getCurrentDatasetSelection() {
  return api.get("/transcomp/data/saved-datasets/current").then((res) => res.data);
}

export function getSavedDatasets() {
  return api.get("/transcomp/data/saved-datasets").then((res) => res.data);
}

export function saveCurrentDataset(name) {
  return api.post("/transcomp/data/saved-datasets", { name }).then((res) => res.data);
}

export function selectSavedDataset(datasetId) {
  return api.post("/transcomp/data/saved-datasets/select", { datasetId }).then((res) => res.data);
}

export function deleteSavedDataset(datasetId) {
  return api.delete(`/transcomp/data/saved-datasets/${encodeURIComponent(datasetId)}`).then((res) => res.data);
}

export function getYamlFile(filename) {
  return api.get(`/transcomp/data/download/${encodeURIComponent(filename)}`, {
    responseType: "blob",
  });
}

export function getCurrentConfigSelection() {
  return api.get("/transcomp/config").then((res) => res.data);
}

export function fetchRunHistory() {
  return api.get("/transcomp/runHistory/history").then((res) => res.data);
}

export function listDir(path = "") {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return api.get(`/transcomp/results/list-dir${query}`).then((res) => res.data.contents);
}

export function getDownloadUrl(path) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/transcomp/results/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

export function fetchRunStatus() {
  return api.get("/transcomp/runHistory/status").then((res) => res.data);
}

export function openRunStream(token) {
  const baseUrl = api.defaults.baseURL || "/api";
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${baseUrl}/transcomp/runHistory/stream${qs}`);
}

export function runShellScript(runName) {
  return api.get("/transcomp/runModel/run-script", {
    params: { runName },
  }).then((res) => res.data);
}

export function saveRun(runInfo) {
  return api.post("/transcomp/runHistory/save", runInfo);
}
