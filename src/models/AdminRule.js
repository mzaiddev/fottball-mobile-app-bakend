const mongoose = require("mongoose");

const adminRuleSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["training", "nutrition", "matchday", "rehab", "community", "general"],
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    payload: mongoose.Schema.Types.Mixed,
    version: {
      type: Number,
      default: 1
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminRule", adminRuleSchema);
