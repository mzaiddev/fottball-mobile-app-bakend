const router = require("express").Router();
const controller = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

router.use(protect);
router.get("/dashboard", controller.getDashboard);
router.patch("/onboarding", validateBody({
  completed: { type: "boolean" },
  currentStep: { type: "number", min: 0 },
  source: { type: "string", max: 120 },
  referralCodeEntered: { type: "string", max: 40 },
  goals: { type: "array" },
  constraints: { type: "object" },
  answers: { type: "object" }
}), controller.updateOnboarding);
router.patch("/profile", validateBody({
  fullName: { type: "string", max: 120 },
  countryCode: { type: "string", max: 10 },
  profilePhotoUrl: { type: "string", max: 500 },
  goals: { type: "array" },
  constraints: { type: "object" }
}), controller.updateProfile);
router.post("/wearables", validateBody({
  provider: { type: "string", required: true, enum: ["appleHealth", "googleFit", "samsungHealth", "garmin", "whoop"] },
  connected: { type: "boolean", required: true }
}), controller.connectWearable);
router.post("/push-token", validateBody({
  token: { type: "string", required: true, max: 300 },
  provider: { type: "string", enum: ["expo", "fcm", "apns"] },
  platform: { type: "string", max: 40 },
  deviceId: { type: "string", max: 120 }
}), controller.registerPushToken);
router.get("/referrals", controller.getReferralStats);
router.get("/notifications", controller.listNotifications);
router.patch("/notifications/:id/read", controller.markNotificationRead);
router.post("/support-tickets", validateBody({
  subject: { type: "string", required: true, min: 3, max: 180 },
  description: { type: "string", required: true, min: 5, max: 5000 }
}), controller.createSupportTicket);

module.exports = router;
