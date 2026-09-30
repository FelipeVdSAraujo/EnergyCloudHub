import mongoose from "mongoose";

const ConfigFileSchema = new mongoose.Schema(
  {
    // Owner of the config
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Display name / filename
    filename: {
      type: String,
      required: true,
      trim: true,
    },

    // Model name / model
    model: {
        type: String,
        required: true,
        trim: true,
      },

    // Raw YAML or config text
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Optional: parsed version (for querying)
    parsed: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Metadata
    size: {
      type: Number, // bytes
      required: true,
    },

    mimeType: {
      type: String,
      default: "application/x-yaml",
    },

    isSelected: {
      type: Boolean,
      default: false,
      index: true,
    },


  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// One active config per user + filename
ConfigFileSchema.index({ owner: 1, filename: 1, isActive: 1 });

export default mongoose.model("Config", ConfigFileSchema);
