import api from "../../../api";

export function getConfig() {
  return api.get("/config").then((res) => res.data);
}

export function getCurrentConfigSelection() {
  return api.get("/config/current").then((res) => res.data);
}

export function validateCurrentConfig() {
  return api.get("/config/validate").then((res) => res.data);
}

export function validateConfigDraft(content) {
  return api.post("/config/validate", { content }).then((res) => res.data);
}

export function resetConfig() {
  return api.post("/config/reset");
}

export function saveConfig(config) {
  return api.put("/config", config);
}

export function selectConfig(configId) {
  return api.post("/config/select", { configId }).then((res) => res.data);
}

export function getUserConfigs() {
  return api.get("/config/user_configs").then((res) => res.data);
}


/**
 * Returns { files: string[], overridden: Record<string, boolean>, modifiedFiles: string[], overrideSizeBytes: number }.
 * overridden[filename] === true means the user has uploaded a custom version
 * of that file; false/absent means the baseline dataset file is in use.
 */
export function getUploadedFiles() {
  return api.get("/upload/list-uploads").then((res) => res.data);
}

export function getCurrentDatasetSelection() {
  return api.get("/upload/saved-datasets/current").then((res) => res.data);
}

export function getSavedDatasets() {
  return api.get("/upload/saved-datasets").then((res) => res.data);
}

export function saveCurrentDataset(name) {
  return api.post("/upload/saved-datasets", { name }).then((res) => res.data);
}

export function selectSavedDataset(datasetId) {
  return api.post("/upload/saved-datasets/select", { datasetId }).then((res) => res.data);
}

export function deleteSavedDataset(datasetId) {
  return api.delete(`/upload/saved-datasets/${datasetId}`).then((res) => res.data);
}





export function uploadExcelFiles(formData) {
  return api.post("/upload/upload-excel", formData);
}

export function resetUploads() {
  return api.post("/upload/reset-uploads");
}

export function getExcelFile(filename) {
  return api
    .get(`/upload/download/${filename}`, { responseType: "arraybuffer" })
    .then((res) => new Uint8Array(res.data));
}

export function listDir(path = "") {
  return api
    .get("/results/list-dir", { params: path ? { path } : {} })
    .then((res) => res.data.contents);
}

export function getDownloadUrl(path) {
  const token = localStorage.getItem("token") || "";
  return `${api.defaults.baseURL}/results/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

export function fetchIamcExport(runName, modelName) {
  const params = { run: runName };
  if (modelName) params.modelName = modelName;
  return api.get("/results/iamc-export", {
    params,
    responseType: "blob",
  });
}

export function fetchRunHistory() {
  return api.get("/runs/history").then((res) => res.data);
}

export function fetchRunStatus() {
  return api.get("/runs/status").then((res) => res.data);
}

export function openRunStream(token) {
  const baseUrl = api.defaults.baseURL || "/api";
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${baseUrl}/runs/stream${qs}`);
}

export function runShellScript(model, runName, configId, options = {}) {
  const { dataset, datasetPath, forceRerun } = options;
  const params = { model, runName, configId };
  if (dataset) params.dataset = dataset;
  if (datasetPath) params.datasetPath = datasetPath;
  if (typeof forceRerun === "boolean") params.forceRerun = forceRerun;

  return api
    .get("/shell/run-script", { params })
    .then((res) => res.data);
}

export function saveRun(runInfo) {
  return api.post("/runs/save", runInfo);
}
