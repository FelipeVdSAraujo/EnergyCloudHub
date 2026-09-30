import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import yaml from "yaml";

import SavedDataset from "../../models/SavedDataset.js";
import {
  ALLOWED_DATASET_FILES,
  REQUIRED_DATASET_FILES,
  getEffectiveDatasetFilePath,
  getEffectiveDatasetFiles,
  getUserOverrideDir,
  isAllowedDatasetFilename,
  resetUserOverrides,
  validateDatasetCompleteness,
  getCurrentOverrideSummary,
} from "../../utils/transcompDatasetOverrides.js";
import {
  BASELINE_DATASET_NAME,
  MAX_SAVED_DATASETS_PER_USER,
  MAX_SAVED_DATASET_BYTES_PER_USER,
  deleteSavedDatasetSnapshot,
  normalizeDatasetName,
  restoreSavedDatasetSnapshot,
  writeSavedDatasetSnapshot,
} from "../../utils/transcompSavedDatasets.js";

const router = express.Router();

const MODEL_NAME = "transcomp";
const TOP_LEVEL_KEYS_BY_FILE = {
  "Model.yaml": "Model",
  "GeographicElement.yaml": "GeographicElement",
  "Mode.yaml": "Mode",
  "Product.yaml": "Product",
  "Path.yaml": "Path",
  "Fuel.yaml": "Fuel",
  "Technology.yaml": "Technology",
  "Vehicletype.yaml": "Vehicletype",
  "TechVehicle.yaml": "TechVehicle",
  "InitialVehicleStock.yaml": "InitialVehicleStock",
  "InitialFuelingInfr.yaml": "InitialFuelingInfr",
  "InitialModeInfr.yaml": "InitialModeInfr",
  "FinancialStatus.yaml": "FinancialStatus",
  "Regiontype.yaml": "Regiontype",
  "Odpair.yaml": "Odpair",
  "Speed.yaml": "Speed",
  "Node.yaml": "Node",
  "InitDetourTime.yaml": "InitDetourTime",
  "Initial_Mode_Share.yaml": "Initial_Mode_Share",
  "ModeShares.yaml": "ModeShares",
  "ModeSharemaxbyyear.yaml": "ModeSharemaxbyyear",
  "ModeShareminbyyear.yaml": "ModeShareminbyyear",
  "MarketShares.yaml": "MarketShares",
  "EmissionLimitbymode.yaml": "EmissionLimitbymode",
  "EmissionLimitbyyear.yaml": "EmissionLimitbyyear",
  "VehicleSubsidy.yaml": "VehicleSubsidy",
  "DetourTimeReduction.yaml": "DetourTimeReduction",
  "SupplyType.yaml": "SupplyType",
  "InitialSupplyInfr.yaml": "InitialSupplyInfr",
};

function toSavedDatasetResponse(doc) {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    changedFiles: doc.changedFiles || [],
    sizeBytes: doc.sizeBytes || 0,
    baselineDatasetName: doc.baselineDatasetName,
    isSelected: Boolean(doc.isSelected),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function clearSavedDatasetSelection(userId) {
  await SavedDataset.updateMany({ owner: userId, model: MODEL_NAME }, { $set: { isSelected: false } });
}

async function resolveCurrentDatasetSelection(userId) {
  const selectedDataset = await SavedDataset.findOne({
    owner: userId,
    model: MODEL_NAME,
    isSelected: true,
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (selectedDataset) {
    return {
      displayName: selectedDataset.name,
      source: "saved",
      datasetId: String(selectedDataset._id),
      changedFiles: selectedDataset.changedFiles || [],
      sizeBytes: selectedDataset.sizeBytes || 0,
    };
  }

  const currentOverride = getCurrentOverrideSummary(userId);
  if (currentOverride.changedFiles.length === 0) {
    return {
      displayName: "Baseline",
      source: "baseline",
      datasetId: null,
      changedFiles: [],
      sizeBytes: 0,
    };
  }

  return {
    displayName: "User_Defined",
    source: "runtime",
    datasetId: null,
    changedFiles: currentOverride.changedFiles,
    sizeBytes: currentOverride.sizeBytes,
  };
}

function validateYamlStructure(userId) {
  const files = getEffectiveDatasetFiles(userId);
  const issues = [];

  for (const filename of files) {
    const filePath = getEffectiveDatasetFilePath(userId, filename);
    const expectedKey = TOP_LEVEL_KEYS_BY_FILE[filename];

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = yaml.parse(content);

      if (!parsed || typeof parsed !== "object") {
        issues.push({ filename, severity: "error", message: "YAML root must be a mapping/object." });
        continue;
      }

      if (expectedKey && !Object.prototype.hasOwnProperty.call(parsed, expectedKey)) {
        issues.push({
          filename,
          severity: "warning",
          message: `Expected top-level key '${expectedKey}' not found.`,
        });
      }
    } catch (error) {
      issues.push({ filename, severity: "error", message: `Invalid YAML: ${error.message}` });
    }
  }

  return issues;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = getUserOverrideDir(req.user?.id);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    if (!isAllowedDatasetFilename(file.originalname)) {
      return cb(new Error(`Invalid filename: ${file.originalname}`));
    }
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

router.post("/upload-yaml", upload.array("files", 40), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  await clearSavedDatasetSelection(req.user?.id);

  const uploadedFiles = req.files.map((f) => ({
    originalname: f.originalname,
    path: f.path,
    size: f.size,
  }));

  return res.json({ message: "Files uploaded", files: uploadedFiles });
});

router.get("/list-uploads", (req, res) => {
  try {
    const files = getEffectiveDatasetFiles(req.user?.id);
    const overrideDir = getUserOverrideDir(req.user?.id);
    const currentOverride = getCurrentOverrideSummary(req.user?.id);
    const completeness = validateDatasetCompleteness(req.user?.id);

    const overridden = {};
    for (const filename of files) {
      overridden[filename] = fs.existsSync(path.join(overrideDir, filename));
    }

    return res.json({
      files,
      requiredFiles: REQUIRED_DATASET_FILES,
      overridden,
      modifiedFiles: currentOverride.changedFiles,
      overrideSizeBytes: currentOverride.sizeBytes,
      missingRequiredFiles: completeness.missingRequiredFiles,
      valid: completeness.valid,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to list files", details: error.message });
  }
});

router.get("/validate", (req, res) => {
  try {
    const completeness = validateDatasetCompleteness(req.user?.id);
    const structureIssues = validateYamlStructure(req.user?.id);
    const hasErrors = structureIssues.some((issue) => issue.severity === "error");

    return res.json({
      valid: completeness.valid && !hasErrors,
      missingRequiredFiles: completeness.missingRequiredFiles,
      issues: structureIssues,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to validate dataset", details: error.message });
  }
});

router.post("/reset-uploads", async (req, res) => {
  try {
    resetUserOverrides(req.user?.id);
    await clearSavedDatasetSelection(req.user?.id);
    return res.json({ message: "User dataset overrides reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error resetting uploads", details: error.message });
  }
});

router.get("/saved-datasets/current", async (req, res) => {
  try {
    const selection = await resolveCurrentDatasetSelection(req.user?.id);
    return res.json(selection);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to resolve current dataset", details: error.message });
  }
});

router.get("/saved-datasets", async (req, res) => {
  try {
    const datasets = await SavedDataset.find({ owner: req.user?.id, model: MODEL_NAME })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({ datasets: datasets.map(toSavedDatasetResponse) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch saved datasets", details: error.message });
  }
});

router.post("/saved-datasets", async (req, res) => {
  try {
    const userId = req.user?.id;
    const rawName = String(req.body?.name || "").trim();
    const slug = normalizeDatasetName(rawName);
    if (!slug) {
      return res.status(400).json({ error: "Dataset name is required" });
    }

    const currentOverride = getCurrentOverrideSummary(userId);
    if (currentOverride.changedFiles.length === 0) {
      return res.status(400).json({ error: "No modified dataset files to save" });
    }

    const existingDataset = await SavedDataset.findOne({ owner: userId, model: MODEL_NAME, slug });
    const userDatasets = await SavedDataset.find({ owner: userId, model: MODEL_NAME })
      .select("_id sizeBytes")
      .lean();

    if (!existingDataset && userDatasets.length >= MAX_SAVED_DATASETS_PER_USER) {
      return res.status(400).json({
        error: `You can save at most ${MAX_SAVED_DATASETS_PER_USER} datasets. Delete one before saving another.`,
      });
    }

    const usedBytesExcludingExisting = userDatasets.reduce((total, dataset) => {
      if (existingDataset && String(dataset._id) === String(existingDataset._id)) {
        return total;
      }
      return total + Number(dataset.sizeBytes || 0);
    }, 0);

    if (usedBytesExcludingExisting + currentOverride.sizeBytes > MAX_SAVED_DATASET_BYTES_PER_USER) {
      return res.status(400).json({
        error: `Saving this dataset would exceed the ${Math.round(MAX_SAVED_DATASET_BYTES_PER_USER / (1024 * 1024))} MB per-user storage limit.`,
      });
    }

    const snapshotResult = writeSavedDatasetSnapshot(userId, slug, rawName, currentOverride.changedFiles);

    const datasetDoc = await SavedDataset.findOneAndUpdate(
      { owner: userId, model: MODEL_NAME, slug },
      {
        owner: userId,
        model: MODEL_NAME,
        name: rawName,
        slug,
        relativePath: snapshotResult.relativePath,
        changedFiles: currentOverride.changedFiles,
        sizeBytes: snapshotResult.sizeBytes,
        baselineDatasetName: BASELINE_DATASET_NAME,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await SavedDataset.updateMany(
      { owner: userId, model: MODEL_NAME, _id: { $ne: datasetDoc._id } },
      { $set: { isSelected: false } }
    );
    await SavedDataset.findByIdAndUpdate(datasetDoc._id, { $set: { isSelected: true } });

    return res.json({
      message: existingDataset ? "Dataset updated" : "Dataset saved",
      dataset: { ...toSavedDatasetResponse(datasetDoc), isSelected: true },
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to save dataset", details: error.message });
  }
});

router.post("/saved-datasets/select", async (req, res) => {
  try {
    const userId = req.user?.id;
    const { datasetId } = req.body || {};
    if (!datasetId) {
      return res.status(400).json({ error: "datasetId is required" });
    }

    const datasetDoc = await SavedDataset.findOne({ _id: datasetId, owner: userId, model: MODEL_NAME });
    if (!datasetDoc) {
      return res.status(404).json({ error: "Saved dataset not found" });
    }

    restoreSavedDatasetSnapshot(userId, datasetDoc.slug);

    await SavedDataset.updateMany({ owner: userId, model: MODEL_NAME }, { $set: { isSelected: false } });
    await SavedDataset.findByIdAndUpdate(datasetDoc._id, { $set: { isSelected: true } });

    return res.json({
      message: "Dataset loaded",
      dataset: { ...toSavedDatasetResponse(datasetDoc), isSelected: true },
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load dataset", details: error.message });
  }
});

router.delete("/saved-datasets/:datasetId", async (req, res) => {
  try {
    const userId = req.user?.id;
    const { datasetId } = req.params;

    const datasetDoc = await SavedDataset.findOne({ _id: datasetId, owner: userId, model: MODEL_NAME });
    if (!datasetDoc) {
      return res.status(404).json({ error: "Saved dataset not found" });
    }

    deleteSavedDatasetSnapshot(userId, datasetDoc.slug);
    await SavedDataset.deleteOne({ _id: datasetDoc._id });

    return res.json({
      message: "Dataset deleted",
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete dataset", details: error.message });
  }
});

router.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  if (!isAllowedDatasetFilename(filename)) {
    return res.status(400).json({ message: "Invalid filename" });
  }

  const filePath = getEffectiveDatasetFilePath(req.user?.id, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  return res.download(filePath, filename, (error) => {
    if (error) {
      console.error("Download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download file" });
      }
    }
  });
});

export default router;
