const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category: {
      type: String,
      enum: ["strength", "mobility", "conditioning", "technique", "recovery"],
      required: true
    },
    bodyPart: String,
    goalTags: [String],
    equipment: [String],
    intensity: String,
    video: {
      url: String,
      publicId: String,
      thumbnail: String
    },
    instructions: [String],
    regressions: [String],
    progressions: [String],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Exercise", exerciseSchema);
