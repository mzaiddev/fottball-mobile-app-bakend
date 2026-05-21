const router = require("express").Router();
const controller = require("../controllers/plan.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

router.use(protect);
router.post("/generate", validateBody({
  weekStart: { type: "string", max: 40 },
  matchDays: { type: "array", max: 7 },
  teamTrainingDays: { type: "array", max: 7 },
  gymDays: { type: "number", min: 0, max: 7 },
  injuries: { type: "array" },
  position: { type: "string", max: 40 }
}), controller.generatePlan);
router.post("/regenerate", validateBody({
  matchDays: { type: "array", max: 7 },
  teamTrainingDays: { type: "array", max: 7 },
  gymDays: { type: "number", min: 0, max: 7 },
  injuries: { type: "array" },
  position: { type: "string", max: 40 }
}), controller.regeneratePlan);
router.get("/current", controller.getCurrentPlan);
router.post("/workouts/log", validateBody({
  weeklyPlan: { type: "string", max: 80 },
  sessionId: { type: "string", max: 120 },
  performedAt: { type: "string", max: 40 },
  title: { type: "string", required: true, max: 160 },
  durationMin: { type: "number", required: true, min: 1, max: 240 },
  exercises: { type: "array" },
  rpe: { type: "number", min: 1, max: 10 },
  soreness: { type: "number", min: 1, max: 10 },
  notes: { type: "string", max: 2000 },
  trainingLoad: { type: "number", min: 0 }
}), controller.logWorkout);
router.get("/workouts/logs", controller.listWorkoutLogs);
router.patch("/workouts/logs/:id", validateBody({
  rpe: { type: "number", min: 1, max: 10 },
  soreness: { type: "number", min: 1, max: 10 },
  notes: { type: "string", max: 2000 },
  durationMin: { type: "number", min: 1, max: 240 },
  exercises: { type: "array" }
}), controller.updateWorkoutLog);
router.get("/library/exercises", controller.listWorkoutLibrary);
router.post("/progress", validateBody({
  type: { type: "string", required: true, max: 80 },
  metric: { type: "string", required: true, max: 120 },
  value: { type: "number", required: true },
  unit: { type: "string", max: 40 },
  notes: { type: "string", max: 2000 },
  metadata: { type: "object" },
  recordedAt: { type: "string", max: 40 }
}), controller.addProgressEntry);
router.get("/insights", controller.getInsights);
router.post("/ai-chat", validateBody({
  message: { type: "string", required: true, min: 1, max: 2000 },
  history: { type: "array", max: 20 }
}), controller.aiCoachChat);

module.exports = router;
