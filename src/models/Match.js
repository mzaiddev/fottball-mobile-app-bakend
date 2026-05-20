const mongoose = require("mongoose");

const checklistSchema = new mongoose.Schema(
  {
    id: String,
    sectionId: String,
    title: String,
    label: String,
    subtitle: String,
    completed: { type: Boolean, default: false },
    completedAt: Date
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    opponent: { type: String, required: true },
    dateTime: { type: Date, required: true },
    venue: String,
    location: String,
    competitionType: String,
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled"
    },
    preparationChecklist: [checklistSchema],
    gameDayChecklist: [checklistSchema],
    recoveryChecklist: [checklistSchema],
    performanceLog: {
      minutesPlayed: Number,
      goals: Number,
      assists: Number,
      positionPlayed: String,
      selfRating: Number,
      technical: Number,
      physical: Number,
      mental: Number,
      whatWentWell: String,
      improveNext: String,
      opponentQuality: Number,
      notes: String
    },
    linkedContent: {
      workoutLogIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WorkoutLog" }],
      nutritionLogIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "NutritionLog" }]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Match", matchSchema);
