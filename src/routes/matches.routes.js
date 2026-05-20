const router = require("express").Router();
const controller = require("../controllers/match.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);
router.post("/", controller.createMatch);
router.get("/", controller.listMatches);
router.get("/history", controller.getHistory);
router.post("/auto-adjust-plan", controller.autoAdjustPlanAroundMatches);
router.get("/:id/hub", controller.getMatchHub);
router.patch("/:id/checklist", controller.updatePreparationChecklist);
router.post("/:id/performance", controller.logPerformance);

module.exports = router;
