const express = require("express");
const controller = require("../controllers/integrations.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/checkout", protect, controller.createSubscriptionCheckout);
router.get("/referral-link", protect, controller.createReferralShareLink);
router.post("/upload", protect, controller.upload.single("file"), controller.cloudinaryUploadResult);
router.post("/webhooks/revenuecat", express.json(), controller.revenueCatWebhook);
router.post("/webhooks/stripe", controller.stripeWebhook);

module.exports = router;
