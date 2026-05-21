const router = require("express").Router();
const { login, me, register, validateReferralCode } = require("../controllers/auth.controller");
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
router.get("/referrals/:code", validateReferralCode);
router.get("/me", protect, me);

module.exports = router;
