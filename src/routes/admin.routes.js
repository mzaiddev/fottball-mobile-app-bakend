const router = require("express").Router();
const controller = require("../controllers/admin.controller");
const { authorize, protect, requirePermission } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

const text = (required = false, max = 500) => ({ type: "string", required, max });
const number = (min, max) => ({ type: "number", min, max });
const object = (required = false) => ({ type: "object", required });
const array = () => ({ type: "array" });

router.use(
  protect,
  authorize("owner", "admin", "coach", "moderator", "support"),
);
router.get("/dashboard", requirePermission("dashboard"), controller.getDashboardStats);
router.get("/analytics", requirePermission("analytics"), controller.getAnalytics);
router.get("/ai-logs", requirePermission("aiLogs"), controller.listAiLogs);
router.get("/notifications", requirePermission("notifications"), controller.listSentNotifications);
router.post("/notifications", requirePermission("notifications"), validateBody({
  title: text(true, 120),
  body: text(true, 500),
  segment: { type: "string", enum: ["all", "trial", "pro"] },
  data: object()
}), controller.sendNotification);
router.get("/gamification", requirePermission("gamification"), controller.getGamification);
router.get("/users", requirePermission("users"), controller.listUsers);
router.patch("/users/:id", requirePermission("users"), validateBody({
  role: { type: "string", enum: ["owner", "admin", "coach", "moderator", "support", "user"] },
  fullName: text(false, 120),
  position: text(false, 50),
  playerTier: text(false, 50),
  xp: number(0)
}), controller.updateUser);
router.post("/team", requirePermission("roles"), validateBody({
  fullName: text(true, 120),
  email: text(true, 180),
  password: text(false, 120),
  role: { type: "string", required: true, enum: ["admin", "coach", "moderator", "support"] }
}), controller.inviteTeamMember);
router.get("/plans/review-queue", requirePermission("plans"), controller.getPlanReviewQueue);
router.post("/plans/:id/approve", requirePermission("plans"), validateBody({ notes: text(false, 500) }), controller.approvePlan);
router.post("/plans/:id/regenerate", requirePermission("plans"), validateBody({ notes: text(false, 500) }), controller.regeneratePlanReview);
router.post("/plans/:id/reject", requirePermission("plans"), validateBody({ notes: text(false, 500) }), controller.rejectPlan);
router.get("/rules", requirePermission("rules"), controller.listRules);
router.post("/rules", requirePermission("rules"), validateBody({
  category: { type: "string", required: true, enum: ["training", "nutrition", "matchday", "rehab", "community", "general"] },
  name: text(true, 120),
  description: text(false, 1000),
  payload: object(true),
  version: number(1),
  isActive: { type: "boolean" }
}), controller.createRule);
router.patch("/rules/:id", requirePermission("rules"), validateBody({
  category: { type: "string", enum: ["training", "nutrition", "matchday", "rehab", "community", "general"] },
  name: text(false, 120),
  description: text(false, 1000),
  payload: object(),
  version: number(1),
  isActive: { type: "boolean" }
}), controller.updateRule);
router.get("/exercises", requirePermission("content"), controller.listExercises);
router.post("/exercises", requirePermission("content"), validateBody({
  name: text(true, 120),
  slug: text(false, 140),
  category: { type: "string", required: true, enum: ["strength", "mobility", "conditioning", "technique", "recovery"] },
  bodyPart: text(false, 80),
  tags: array(),
  equipment: array(),
  intensity: text(false, 40),
  video: object(),
  instructions: array(),
  regressions: array(),
  progressions: array(),
  isActive: { type: "boolean" }
}), controller.createExercise);
router.delete("/exercises/:id", requirePermission("content"), controller.deleteExercise);
router.get("/recipes", requirePermission("content"), controller.listRecipes);
router.post("/recipes", requirePermission("content"), validateBody({
  name: text(true, 120),
  description: text(false, 1000),
  ingredients: array(),
  steps: array(),
  calories: number(0),
  protein: number(0),
  carbs: number(0),
  fats: number(0),
  hydrationMl: number(0),
  dietaryTags: array(),
  allergens: array(),
  sourceType: text(false, 40),
  isActive: { type: "boolean" }
}), controller.createRecipe);
router.delete("/recipes/:id", requirePermission("content"), controller.deleteRecipe);
router.get("/rehab-protocols", requirePermission("content"), controller.listRehabProtocols);
router.post("/rehab-protocols", requirePermission("content"), validateBody({
  injuryType: text(true, 120),
  phaseName: text(true, 120),
  phaseOrder: number(0),
  entryCriteria: array(),
  exitCriteria: array(),
  exercises: array(),
  isLocked: { type: "boolean" }
}), controller.createRehabProtocol);
router.delete("/rehab-protocols/:id", requirePermission("content"), controller.deleteRehabProtocol);
router.get("/subscriptions", requirePermission("subscriptions"), controller.listSubscriptions);
router.patch("/subscriptions/:id", requirePermission("subscriptions"), validateBody({
  planId: text(false, 120),
  planName: text(false, 120),
  status: { type: "string", enum: ["trialing", "active", "canceled", "past_due", "inactive", "expired", "refunded"] },
  amount: number(0),
  currency: text(false, 10),
  trialEndsAt: text(false, 40),
  currentPeriodEnd: text(false, 40),
  entitlements: array(),
  metadata: object()
}), controller.updateSubscription);
router.get("/support-tickets", requirePermission("support"), controller.listSupportTickets);
router.patch("/support-tickets/:id", requirePermission("support"), validateBody({
  status: { type: "string", enum: ["open", "in_progress", "resolved"] },
  assignedTo: text(false, 60),
  reply: text(false, 5000)
}), controller.updateSupportTicket);

module.exports = router;
