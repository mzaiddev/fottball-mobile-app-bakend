const mongoose = require("mongoose");

const aiUsageLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["plan_generation", "meal_generation", "chat", "system_adjustment"],
      required: true,
    },
    weekKey: String,
    count: {
      type: Number,
      default: 1,
    },
    limit: {
      type: Number,
      default: 2,
    },
    estimatedTokens: {
      type: Number,
      default: 0,
    },
    charged: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["success", "fallback", "error"],
      default: "success",
    },
    requestSummary: String,
    responseSummary: String,
    errorMessage: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("AIUsageLog", aiUsageLogSchema);
