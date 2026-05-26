const router = require("express").Router();
const controller = require("../controllers/match.controller");
const { protect, requireActiveEntitlement } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

router.use(protect);
router.use(requireActiveEntitlement);
router.post("/", validateBody({
  opponent: { type: "string", required: true, min: 2, max: 120 },
  dateTime: { type: "string", required: true, max: 60 },
  venue: { type: "string", max: 80 },
  location: { type: "string", max: 160 },
  competitionType: { type: "string", max: 80 }
}), controller.createMatch);
router.get("/", controller.listMatches);
router.get("/history", controller.getHistory);
router.post("/auto-adjust-plan", controller.autoAdjustPlanAroundMatches);
router.get("/:id/hub", controller.getMatchHub);
router.patch("/:id/checklist", validateBody({
  completedIds: { type: "array" },
  items: { type: "array" }
}), controller.updatePreparationChecklist);
router.post("/:id/performance", validateBody({
  minutesPlayed: { type: "number", min: 0, max: 130 },
  goals: { type: "number", min: 0 },
  assists: { type: "number", min: 0 },
  positionPlayed: { type: "string", max: 40 },
  selfRating: { type: "number", min: 1, max: 10 },
  technical: { type: "number", min: 1, max: 10 },
  physical: { type: "number", min: 1, max: 10 },
  mental: { type: "number", min: 1, max: 10 },
  whatWentWell: { type: "string", max: 2000 },
  improveNext: { type: "string", max: 2000 },
  opponentQuality: { type: "number", min: 1, max: 10 },
  notes: { type: "string", max: 2000 }
}), controller.logPerformance);

module.exports = router;
