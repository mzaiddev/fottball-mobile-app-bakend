const mongoose = require("mongoose");

const progressEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: [
        "body_weight",
        "body_fat",
        "measurement",
        "fitness_test",
        "lift",
        "photo",
        "sleep",
        "recovery"
      ],
      required: true
    },
    metric: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    unit: String,
    notes: String,
    metadata: mongoose.Schema.Types.Mixed,
    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProgressEntry", progressEntrySchema);
