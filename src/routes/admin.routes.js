const router = require("express").Router();
const controller = require("../controllers/admin.controller");
const { authorize, protect } = require("../middlewares/auth.middleware");

router.use(
  protect,
  authorize("owner", "admin", "coach", "moderator", "support"),
);
router.get("/dashboard", controller.getDashboardStats);
router.get("/analytics", controller.getAnalytics);
router.get("/ai-logs", controller.listAiLogs);
router.get("/notifications", controller.listSentNotifications);
router.post("/notifications", controller.sendNotification);
router.get("/gamification", controller.getGamification);
router.get("/users", controller.listUsers);
router.patch("/users/:id", controller.updateUser);
router.post("/team", controller.inviteTeamMember);
router.get("/plans/review-queue", controller.getPlanReviewQueue);
router.post("/plans/:id/approve", controller.approvePlan);
router.post("/plans/:id/regenerate", controller.regeneratePlanReview);
router.get("/rules", controller.listRules);
router.post("/rules", controller.createRule);
router.patch("/rules/:id", controller.updateRule);
router.get("/exercises", controller.listExercises);
router.post("/exercises", controller.createExercise);
router.delete("/exercises/:id", controller.deleteExercise);
router.get("/recipes", controller.listRecipes);
router.post("/recipes", controller.createRecipe);
router.delete("/recipes/:id", controller.deleteRecipe);
router.get("/rehab-protocols", controller.listRehabProtocols);
router.post("/rehab-protocols", controller.createRehabProtocol);
router.delete("/rehab-protocols/:id", controller.deleteRehabProtocol);
router.get("/subscriptions", controller.listSubscriptions);
router.patch("/subscriptions/:id", controller.updateSubscription);
router.get("/support-tickets", controller.listSupportTickets);
router.patch("/support-tickets/:id", controller.updateSupportTicket);

module.exports = router;
