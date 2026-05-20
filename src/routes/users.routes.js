const router = require("express").Router();
const controller = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);
router.get("/dashboard", controller.getDashboard);
router.patch("/onboarding", controller.updateOnboarding);
router.patch("/profile", controller.updateProfile);
router.post("/wearables", controller.connectWearable);
router.get("/referrals", controller.getReferralStats);
router.get("/notifications", controller.listNotifications);
router.patch("/notifications/:id/read", controller.markNotificationRead);
router.post("/support-tickets", controller.createSupportTicket);

module.exports = router;
