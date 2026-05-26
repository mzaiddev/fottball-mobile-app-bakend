const router = require("express").Router();
const { StatusCodes } = require("http-status-codes");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { sendTrialExpiryReminders, syncExpiredSubscriptions } = require("../services/billing.service");

function requireCronSecret(req, res, next) {
  if (!env.cronSecret) return next();
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${env.cronSecret}`) {
    return next(new ApiError(StatusCodes.UNAUTHORIZED, "Invalid cron secret"));
  }
  return next();
}

router.get("/subscriptions", requireCronSecret, asyncHandler(async (req, res) => {
  const [reminders, expired] = await Promise.all([
    sendTrialExpiryReminders(),
    syncExpiredSubscriptions()
  ]);

  res.json(new ApiResponse("Subscription cron completed", { reminders, expired }));
}));

module.exports = router;
