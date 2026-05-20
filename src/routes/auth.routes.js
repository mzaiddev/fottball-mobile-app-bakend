const router = require("express").Router();
const { login, me, register, validateReferralCode } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.get("/referrals/:code", validateReferralCode);
router.get("/me", protect, me);

module.exports = router;
