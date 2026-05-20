const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema(
  {
    name: String,
    sets: Number,
    reps: String,
    restSec: Number,
    weightGuidance: String,
    notes: String,
    videoUrl: String,
    alternatives: [String]
  },
  { _id: false }
);

const habitSchema = new mongoose.Schema(
  {
    title: String,
    target: String,
    completed: { type: Boolean, default: false }
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    sessionId: String,
    dayLabel: String,
    title: String,
    type: {
      type: String,
      enum: ["gym", "pitch", "recovery", "match", "rehab", "rest"]
    },
    focus: String,
    durationMin: Number,
    intensity: String,
    notes: String,
    exercises: [exerciseSchema],
    habits: [habitSchema]
  },
  { _id: false }
);

const weeklyPlanSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    weekStart: {
      type: Date,
      required: true
    },
    weekEnd: {
      type: Date,
      required: true
    },
    weekKey: {
      type: String,
      required: true
    },
    goals: [String],
    constraints: {
      matchDays: [String],
      teamTrainingDays: [String],
      gymDays: Number,
      position: String,
      injuries: [String]
    },
    status: {
      type: String,
      enum: ["draft", "pending_review", "approved", "live", "completed"],
      default: "pending_review"
    },
    source: {
      type: String,
      enum: ["ai", "template", "system_adjusted"],
      default: "ai"
    },
    sessions: [sessionSchema],
    adminReview: {
      status: {
        type: String,
        enum: ["pending", "approved", "regenerated"],
        default: "pending"
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      notes: String,
      reviewedAt: Date
    },
    regenerationCount: {
      type: Number,
      default: 0
    },
    whyThis: String,
    aiMeta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

weeklyPlanSchema.index({ user: 1, weekKey: 1 }, { unique: true });

module.exports = mongoose.model("WeeklyPlan", weeklyPlanSchema);
