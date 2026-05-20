const mongoose = require("mongoose");

const rehabExerciseSchema = new mongoose.Schema(
  {
    name: String,
    sets: Number,
    reps: String,
    notes: String
  },
  { _id: false }
);

const rehabProtocolSchema = new mongoose.Schema(
  {
    injuryType: {
      type: String,
      required: true
    },
    phaseName: {
      type: String,
      required: true
    },
    phaseOrder: {
      type: Number,
      required: true
    },
    entryCriteria: [String],
    exitCriteria: [String],
    exercises: [rehabExerciseSchema],
    isLocked: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("RehabProtocol", rehabProtocolSchema);
