const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const Match = require("../models/Match");
const Notification = require("../models/Notification");
const NutritionLog = require("../models/NutritionLog");
const PushToken = require("../models/PushToken");
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
const { hasActiveEntitlement } = require("../services/billing.service");
const { trackEvent } = require("../services/analytics.service");
const { normalizeDayLabel } = require("../utils/weekdays");

const onboardingResponses = {
  pace_acceleration: "You will improve your pace and acceleration with consistent training.",
  strength_physicality: "You will build strength and physicality with structured football gym work.",
  match_fitness: "You will improve your match fitness with consistent training.",
  technical_ability: "You will sharpen your technical ability with focused, repeatable practice.",
  everything: "You will develop into a more complete player across every performance area."
};

const DAY_ORDER = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6
};

function pickTodayOrNextSession(plan) {
  const sessions = plan?.sessions || [];
  if (!sessions.length) return null;
  const todayLabel = dayjs().format("dddd");
  const todayIndex = DAY_ORDER[todayLabel];
  const todaySession = sessions.find((session) => normalizeDayLabel(session.dayLabel) === todayLabel);
  if (todaySession) return todaySession;
  return (
    sessions
      .filter((session) => session.type !== "rest")
      .sort((a, b) => {
        const aIndex = DAY_ORDER[normalizeDayLabel(a.dayLabel)] ?? 99;
        const bIndex = DAY_ORDER[normalizeDayLabel(b.dayLabel)] ?? 99;
        const aDistance = aIndex >= todayIndex ? aIndex - todayIndex : aIndex + 7 - todayIndex;
        const bDistance = bIndex >= todayIndex ? bIndex - todayIndex : bIndex + 7 - todayIndex;
        return aDistance - bDistance;
      })[0] || null
  );
}

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
    WeeklyPlan.findOne({ user: req.user._id, status: { $in: ["approved", "live"] } }).sort({ weekStart: -1 }).lean(),
    NutritionLog.findOne({ user: req.user._id }).sort({ date: -1 }).lean(),
    Match.find({ user: req.user._id, dateTime: { $gte: dayjs().subtract(1, "day").toDate() } }).sort({ dateTime: 1 }).limit(3).lean(),
    WorkoutLog.find({ user: req.user._id }).sort({ performedAt: -1 }).limit(5).lean(),
    Subscription.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean()
  ]);

  const readiness = await calculateReadiness(req.user);
  const entitled = await hasActiveEntitlement(req.user._id);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  await trackEvent({ user: req.user._id, source: "app", type: "dashboard_view", feature: "Dashboard" });

  res.json(
    new ApiResponse("Dashboard snapshot", {
      readiness,
      upcomingWorkout: pickTodayOrNextSession(plan),
      nutritionSummary: nutrition,
      upcomingMatches: matches,
      recentWorkouts: workouts,
      subscription,
      entitled
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

const registerPushToken = asyncHandler(async (req, res) => {
  const token = await PushToken.findOneAndUpdate(
    { token: req.body.token },
    {
      user: req.user._id,
      token: req.body.token,
      provider: req.body.provider || "expo",
      platform: req.body.platform,
      deviceId: req.body.deviceId,
      isActive: true,
      lastSeenAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json(new ApiResponse("Push token registered", token));
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
  registerPushToken,
  getReferralStats
};
