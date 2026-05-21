const express = require("express");
const controller = require("../controllers/integrations.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

const router = express.Router();

router.post("/checkout", protect, validateBody({
  priceId: { type: "string", required: true, max: 180 },
  successUrl: { type: "string", max: 500 },
  cancelUrl: { type: "string", max: 500 }
}), controller.createSubscriptionCheckout);
router.get("/referral-link", protect, controller.createReferralShareLink);
router.post("/upload", protect, controller.upload.single("file"), controller.cloudinaryUploadResult);
router.post("/webhooks/revenuecat", express.json(), controller.revenueCatWebhook);
router.post("/webhooks/stripe", controller.stripeWebhook);

module.exports = router;
