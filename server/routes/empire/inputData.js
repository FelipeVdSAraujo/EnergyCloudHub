
/**
 * upload.js
 * 
 * Express router for managing Excel file uploads in the EnSolve backend.
 * 
 * Features:
 * - Handles upload of required Excel files using multer.
 * - Validates filenames to allow only specific input files.
 * - Lists uploaded Excel files.
 * - Resets uploads to a backup state by restoring from a backup directory.
 * 
 * Endpoints:
 * - POST /api/upload/upload-excel : Uploads multiple Excel files (General.xlsx, Generator.xlsx, etc.).
 * - GET  /api/upload/list-uploads : Lists all uploaded Excel files.
 * - POST /api/upload/reset-uploads: Resets uploads to the backup state.
 * 
 * Usage:
 * - Mounted at /api/upload in the main server.
 * - Used by the frontend for uploading, listing, and resetting input files.
 */


import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import SavedDataset from "../../models/SavedDataset.js";
import {
  ALLOWED_DATASET_FILES,
  getEffectiveDatasetFilePath,
  getEffectiveDatasetFiles,
  getUserOverrideDir,
  isAllowedDatasetFilename,
  resetUserOverrides,
} from "../../utils/datasetOverrides.js";
import {
  BASELINE_DATASET_NAME,
  MAX_SAVED_DATASETS_PER_USER,
  MAX_SAVED_DATASET_BYTES_PER_USER,
  deleteSavedDatasetSnapshot,
  getCurrentOverrideSummary,
  normalizeDatasetName,
  restoreSavedDatasetSnapshot,
  writeSavedDatasetSnapshot,
} from "../../utils/savedDatasets.js";

const router = express.Router();

const allowedFilenames = ALLOWED_DATASET_FILES;
const MODEL_NAME = "empire";

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
  await SavedDataset.updateMany(
    { owner: userId, model: MODEL_NAME },
    { $set: { isSelected: false } }
  );
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
  }
});
const upload = multer({ storage });

// Upload route (multiple files)
router.post('/upload-excel', upload.array('files', 6), async (req, res) => {
  if (!req.files) return res.status(400).json({ message: 'No files uploaded' });

  await clearSavedDatasetSelection(req.user?.id);

    const uploadedFiles = req.files.map(f => ({
        originalname: f.originalname,
        path: f.path
    }));

    res.json({
        message: 'Files uploaded',
        files: uploadedFiles
    });
});

//route to list files
router.get('/list-uploads', (req, res) => {
  try {
    const files = getEffectiveDatasetFiles(req.user?.id);
    const overrideDir = getUserOverrideDir(req.user?.id);
    const currentOverride = getCurrentOverrideSummary(req.user?.id);
    const overridden = {};
    for (const filename of files) {
      overridden[filename] = fs.existsSync(path.join(overrideDir, filename));
    }
    res.json({
      files,
      overridden,
      modifiedFiles: currentOverride.changedFiles,
      overrideSizeBytes: currentOverride.sizeBytes,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to list files' });
  }
});

router.post('/reset-uploads', async (req, res) => {
    try {
        resetUserOverrides(req.user?.id);
        await clearSavedDatasetSelection(req.user?.id);
        res.json({ message: 'User dataset overrides reset successfully' });
    } catch (err) {
        console.error('Error resetting uploads:', err);
        res.status(500).json({ message: 'Error resetting uploads' });
    }
});

router.get('/saved-datasets/current', async (req, res) => {
  try {
    const selection = await resolveCurrentDatasetSelection(req.user?.id);
    return res.json(selection);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to resolve current dataset', details: err.message });
  }
});

router.get('/saved-datasets', async (req, res) => {
  try {
    const datasets = await SavedDataset.find({ owner: req.user?.id, model: MODEL_NAME })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({ datasets: datasets.map(toSavedDatasetResponse) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch saved datasets', details: err.message });
  }
});

router.post('/saved-datasets', async (req, res) => {
  try {
    const userId = req.user?.id;
    const rawName = String(req.body?.name || '').trim();
    const slug = normalizeDatasetName(rawName);
    if (!slug) {
      return res.status(400).json({ error: 'Dataset name is required' });
    }

    const currentOverride = getCurrentOverrideSummary(userId);
    if (currentOverride.changedFiles.length === 0) {
      return res.status(400).json({ error: 'No modified dataset files to save' });
    }

    const existingDataset = await SavedDataset.findOne({
      owner: userId,
      model: MODEL_NAME,
      slug,
    });

    const userDatasets = await SavedDataset.find({ owner: userId, model: MODEL_NAME })
      .select('_id sizeBytes')
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
      {
        owner: userId,
        model: MODEL_NAME,
        slug,
      },
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
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await SavedDataset.updateMany(
      { owner: userId, model: MODEL_NAME, _id: { $ne: datasetDoc._id } },
      { $set: { isSelected: false } }
    );
    await SavedDataset.findByIdAndUpdate(datasetDoc._id, { $set: { isSelected: true } });

    return res.json({
      message: existingDataset ? 'Dataset updated' : 'Dataset saved',
      dataset: {
        ...toSavedDatasetResponse(datasetDoc),
        isSelected: true,
      },
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save dataset', details: err.message });
  }
});

router.post('/saved-datasets/select', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { datasetId } = req.body || {};
    if (!datasetId) {
      return res.status(400).json({ error: 'datasetId is required' });
    }

    const datasetDoc = await SavedDataset.findOne({
      _id: datasetId,
      owner: userId,
      model: MODEL_NAME,
    });
    if (!datasetDoc) {
      return res.status(404).json({ error: 'Saved dataset not found' });
    }

    restoreSavedDatasetSnapshot(userId, datasetDoc.slug);

    await SavedDataset.updateMany(
      { owner: userId, model: MODEL_NAME },
      { $set: { isSelected: false } }
    );
    await SavedDataset.findByIdAndUpdate(datasetDoc._id, { $set: { isSelected: true } });

    return res.json({
      message: 'Dataset loaded',
      dataset: {
        ...toSavedDatasetResponse(datasetDoc),
        isSelected: true,
      },
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load dataset', details: err.message });
  }
});

router.delete('/saved-datasets/:datasetId', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { datasetId } = req.params;
    const datasetDoc = await SavedDataset.findOne({
      _id: datasetId,
      owner: userId,
      model: MODEL_NAME,
    });

    if (!datasetDoc) {
      return res.status(404).json({ error: 'Saved dataset not found' });
    }

    deleteSavedDatasetSnapshot(userId, datasetDoc.slug);
    await SavedDataset.deleteOne({ _id: datasetDoc._id });

    return res.json({
      message: 'Dataset deleted',
      current: await resolveCurrentDatasetSelection(userId),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete dataset', details: err.message });
  }
});






//Upload individual files
// Download individual files
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  if (!allowedFilenames.includes(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }
  const filePath = getEffectiveDatasetFilePath(req.user?.id, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  // Force download with correct filename
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ message: 'Failed to download file' });
    }
  });
});





  
export default router;

