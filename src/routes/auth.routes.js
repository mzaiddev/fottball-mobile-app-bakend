const router = require("express").Router();
const { login, me, register, socialAuth, validateReferralCode } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

router.post("/register", validateBody({
  fullName: { type: "string", required: true, min: 2, max: 120 },
  email: { type: "string", required: true, max: 180 },
  password: { type: "string", required: true, min: 6, max: 120 },
  acceptedTerms: { type: "boolean", required: true },
  referralCodeEntered: { type: "string", max: 40 }
}), register);
router.post("/login", validateBody({
  email: { type: "string", required: true, max: 180 },
  password: { type: "string", required: true, min: 1, max: 120 }
}), login);
router.post("/social", validateBody({
  provider: { type: "string", required: true, enum: ["google", "apple"] },
  idToken: { type: "string", required: true, min: 10, max: 5000 },
  fullName: { type: "string", max: 120 },
  referralCodeEntered: { type: "string", max: 40 }
}), socialAuth);
router.post("/referrals/verify", validateBody({
  code: { type: "string", required: true, min: 2, max: 40 }
}), validateReferralCode);
router.get("/referrals/:code", validateReferralCode);
router.get("/me", protect, me);

module.exports = router;
