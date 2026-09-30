// models/Run.js
// NOTE: Runs are intentionally not scoped to a single owner for read purposes.
// All results are public on this platform — authentication controls hardware
// access only, not result visibility. The owner field is stored for provenance.
import mongoose from "mongoose";

const runSchema = new mongoose.Schema({
  modelName: String,
  runName: String,
  submittedAt: String,
  shellOutput: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  runSignature: String,
  datasetName: String,
  datasetPath: String,
  configId: String,
  selectedDatasetName: String,
  reused: { type: Boolean, default: false },
  reusedFromRunId: String,
  status: { type: String, default: "success" },
  iamcStatus: String,
  iamcDetails: String,
  iamcFile: String,
  iamcValidationPassed: Boolean
});

// Compound index for fast duplicate-run detection.
runSchema.index({ modelName: 1, runSignature: 1 }, { sparse: true });

export default mongoose.model('Run', runSchema);



