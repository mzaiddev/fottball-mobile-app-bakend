const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    type: {
      type: String,
      required: true
    },
    source: {
      type: String,
      enum: ["app", "admin", "backend", "integration"],
      default: "backend"
    },
    feature: String,
    metadata: mongoose.Schema.Types.Mixed,
    occurredAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, occurredAt: -1 });
analyticsEventSchema.index({ user: 1, occurredAt: -1 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
