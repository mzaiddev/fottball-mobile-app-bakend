const router = require("express").Router();
const controller = require("../controllers/plan.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);
router.post("/generate", controller.generatePlan);
router.post("/regenerate", controller.regeneratePlan);
router.get("/current", controller.getCurrentPlan);
router.post("/workouts/log", controller.logWorkout);
router.get("/workouts/logs", controller.listWorkoutLogs);
router.patch("/workouts/logs/:id", controller.updateWorkoutLog);
router.get("/library/exercises", controller.listWorkoutLibrary);
router.post("/progress", controller.addProgressEntry);
router.get("/insights", controller.getInsights);
router.post("/ai-chat", controller.aiCoachChat);

module.exports = router;
