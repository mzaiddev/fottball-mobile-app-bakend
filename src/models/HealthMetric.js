const mongoose = require("mongoose");

const HEALTH_PROVIDERS = ["appleHealth", "samsungHealth", "googleFit", "garmin", "whoop", "manual"];
const HEALTH_METRICS = [
  "steps",
  "distance_m",
  "active_energy_kcal",
  "total_energy_kcal",
  "heart_rate_bpm",
  "resting_heart_rate_bpm",
  "hrv_rmssd_ms",
  "sleep_minutes",
  "workout_minutes"
];

const healthMetricSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    provider: {
      type: String,
      enum: HEALTH_PROVIDERS,
      required: true
    },
    metric: {
      type: String,
      enum: HEALTH_METRICS,
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    sourceName: {
      type: String,
      trim: true,
      maxlength: 120
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

healthMetricSchema.index(
  { user: 1, provider: 1, metric: 1, startDate: 1, endDate: 1 },
  { unique: true }
);
healthMetricSchema.index({ user: 1, metric: 1, startDate: -1 });
healthMetricSchema.index({ user: 1, provider: 1, updatedAt: -1 });

module.exports = mongoose.model("HealthMetric", healthMetricSchema);
module.exports.HEALTH_PROVIDERS = HEALTH_PROVIDERS;
module.exports.HEALTH_METRICS = HEALTH_METRICS;
