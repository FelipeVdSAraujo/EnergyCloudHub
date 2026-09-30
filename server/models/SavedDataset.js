import mongoose from "mongoose";

const SavedDatasetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
      default: "empire",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    relativePath: {
      type: String,
      required: true,
      trim: true,
    },
    changedFiles: {
      type: [String],
      default: [],
    },
    sizeBytes: {
      type: Number,
      required: true,
      default: 0,
    },
    baselineDatasetName: {
      type: String,
      required: true,
      default: "europe_v51",
    },
    isSelected: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

SavedDatasetSchema.index({ owner: 1, model: 1, slug: 1 }, { unique: true });

export default mongoose.model("SavedDataset", SavedDatasetSchema);