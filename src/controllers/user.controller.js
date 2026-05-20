const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const Match = require("../models/Match");
const Notification = require("../models/Notification");
const NutritionLog = require("../models/NutritionLog");
const Referral = require("../models/Referral");
const Subscription = require("../models/Subscription");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const WorkoutLog = require("../models/WorkoutLog");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { calculateReadiness } = require("../services/readiness.service");

const onboardingResponses = {
  pace_acceleration: "You will improve your pace and acceleration with consistent training.",
  strength_physicality: "You will build strength and physicality with structured football gym work.",
  match_fitness: "You will improve your match fitness with consistent training.",
  technical_ability: "You will sharpen your technical ability with focused, repeatable practice.",
  everything: "You will develop into a more complete player across every performance area."
};

const updateOnboarding = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const { constraints, ...onboardingPayload } = payload;
  if (payload.answers?.trainingGoal) {
    payload.answers.trainingGoalResponse = onboardingResponses[payload.answers.trainingGoal];
  }
  const updates = {
    onboarding: {
      ...req.user.onboarding,
      ...onboardingPayload,
      answers: {
        ...(req.user.onboarding?.answers || {}),
        ...(payload.answers || {})
      }
    },
    position: payload.answers?.position || req.user.position,
    goals: payload.goals || req.user.goals
  };

  if (constraints) {
    updates.constraints = {
      ...(req.user.constraints || {}),
      ...constraints
    };
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: updates
    },
    { new: true }
  );

  res.json(new ApiResponse("Onboarding updated", user));
});

const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ["fullName", "countryCode", "profilePhotoUrl", "goals", "constraints"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json(new ApiResponse("Profile updated", user));
});

const connectWearable = asyncHandler(async (req, res) => {
  const { provider, connected } = req.body;
  const allowedProviders = ["appleHealth", "googleFit", "samsungHealth", "garmin", "whoop"];
  if (!allowedProviders.includes(provider)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Unsupported wearable provider");
  }
  const path = `wearableConnections.${provider}`;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: { [path]: Boolean(connected) } }, { new: true });
  res.json(new ApiResponse("Wearable connection updated", user.wearableConnections));
});

const getDashboard = asyncHandler(async (req, res) => {
  const [plan, nutrition, matches, workouts, subscription] = await Promise.all([
    WeeklyPlan.findOne({ user: req.user._id }).sort({ weekStart: -1 }).lean(),
    NutritionLog.findOne({ user: req.user._id }).sort({ date: -1 }).lean(),
    Match.find({ user: req.user._id, dateTime: { $gte: dayjs().subtract(1, "day").toDate() } }).sort({ dateTime: 1 }).limit(3).lean(),
    WorkoutLog.find({ user: req.user._id }).sort({ performedAt: -1 }).limit(5).lean(),
    Subscription.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean()
  ]);

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });

  res.json(
    new ApiResponse("Dashboard snapshot", {
      readiness,
      upcomingWorkout: plan?.sessions?.find((session) => session.type !== "rest") || null,
      nutritionSummary: nutrition,
      upcomingMatches: matches,
      recentWorkouts: workouts,
      subscription
    })
  );
});

const listNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json(new ApiResponse("Notifications", items));
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true },
    { new: true }
  );
  if (!item) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Notification not found");
  }
  res.json(new ApiResponse("Notification updated", item));
});

const createSupportTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.create({
    user: req.user._id,
    subject: req.body.subject,
    description: req.body.description
  });

  res.status(StatusCodes.CREATED).json(new ApiResponse("Support ticket created", ticket));
});

const getReferralStats = asyncHandler(async (req, res) => {
  const referrals = await Referral.find({ referrer: req.user._id }).populate("referredUser", "fullName email");
  const stats = {
    totalReferred: referrals.length,
    pending: referrals.filter((item) => item.status === "pending").length,
    active: referrals.filter((item) => ["trial_started", "active", "rewarded"].includes(item.status)).length,
    rewarded: referrals.filter((item) => item.status === "rewarded").length,
    referrals
  };

  res.json(new ApiResponse("Referral stats", stats));
});

module.exports = {
  updateOnboarding,
  updateProfile,
  connectWearable,
  getDashboard,
  listNotifications,
  markNotificationRead,
  createSupportTicket,
  getReferralStats
};
