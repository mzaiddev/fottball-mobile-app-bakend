const mongoose = require("mongoose");

const loggedExerciseSchema = new mongoose.Schema(
  {
    name: String,
    setIndex: Number,
    weightKg: Number,
    reps: Number,
    completed: { type: Boolean, default: true }
  },
  { _id: false }
);

const workoutLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    weeklyPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeeklyPlan"
    },
    sessionId: String,
    performedAt: {
      type: Date,
      default: Date.now
    },
    title: String,
    durationMin: Number,
    exercises: [loggedExerciseSchema],
    rpe: Number,
    soreness: Number,
    notes: String,
    trainingLoad: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkoutLog", workoutLogSchema);
