const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const AIUsageLog = require("../models/AIUsageLog");
const Exercise = require("../models/Exercise");
const Match = require("../models/Match");
const NutritionLog = require("../models/NutritionLog");
const ProgressEntry = require("../models/ProgressEntry");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const WorkoutLog = require("../models/WorkoutLog");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { getWeekBounds } = require("../utils/date");
const { notifyUser } = require("../services/notification.service");
const { getAdminRuleSettings } = require("../services/adminRules.service");
const { hasActiveEntitlement } = require("../services/billing.service");
const { trackEvent } = require("../services/analytics.service");
const { calculateReadiness } = require("../services/readiness.service");
const { generateWeeklyPlan } = require("../services/weekBuilder.service");
const { generateText } = require("../services/openai.service");
const { normalizeDayLabels } = require("../utils/weekdays");

async function checkPlanAllowance(userId, weekKey, chargedType = "plan_generation") {
  const rules = await getAdminRuleSettings();
  const count = await AIUsageLog.countDocuments({
    user: userId,
    weekKey,
    type: chargedType,
    charged: true
  });

  if (count >= Number(rules.regens || 2)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Weekly AI regeneration allowance reached");
  }
}

const generatePlan = asyncHandler(async (req, res) => {
  const { weekStart, matchDays, teamTrainingDays, gymDays, injuries, position } = req.body;
  const bounds = getWeekBounds(weekStart || new Date());
  const entitled = await hasActiveEntitlement(req.user._id);
  if (!entitled) {
    throw new ApiError(StatusCodes.PAYMENT_REQUIRED, "An active trial or subscription is required to generate plans");
  }
  await checkPlanAllowance(req.user._id, bounds.weekKey);
  const requestedGymDays = gymDays ?? req.user.onboarding?.answers?.gymDays;

  const constraints = {
    matchDays: normalizeDayLabels(matchDays || req.user.onboarding?.answers?.matchDays || []),
    teamTrainingDays: normalizeDayLabels(teamTrainingDays || req.user.onboarding?.answers?.teamTrainingDays || []),
    gymDays: Number.isFinite(Number(requestedGymDays))
      ? Number(requestedGymDays)
      : 2,
    injuries: injuries || req.user.constraints?.injuries || [],
    position: position || req.user.position
  };

  const generated = await generateWeeklyPlan(req.user, constraints);
  const rules = await getAdminRuleSettings();
  const planStatus = rules.requireApproval ? "pending_review" : (generated.status === "approved" ? "approved" : "live");
  const reviewStatus = rules.requireApproval ? "pending" : "approved";

  const plan = await WeeklyPlan.findOneAndUpdate(
    { user: req.user._id, weekKey: bounds.weekKey },
    {
      user: req.user._id,
      weekStart: bounds.weekStart,
      weekEnd: bounds.weekEnd,
      weekKey: bounds.weekKey,
      goals: req.user.goals,
      constraints,
      source: generated.source || "ai",
      status: planStatus,
      sessions: generated.sessions || [],
      whyThis: generated.whyThis || "",
      adminReview: {
        status: reviewStatus,
        reviewedBy: rules.requireApproval ? undefined : req.user._id,
        reviewedAt: rules.requireApproval ? undefined : new Date(),
        notes: rules.requireApproval ? "" : "Auto-approved by Admin Rules"
      },
      aiMeta: {
        generatedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await AIUsageLog.create({
    user: req.user._id,
    type: "plan_generation",
    weekKey: bounds.weekKey,
    charged: true,
    limit: Number(rules.regens || 2),
    requestSummary: "Weekly plan generation",
    responseSummary: `Generated ${plan.sessions.length} sessions`
  });

  await trackEvent({ user: req.user._id, source: "app", type: "plan_generated", feature: "Weekly Plan", metadata: { weekKey: bounds.weekKey, status: plan.status } });
  await notifyUser(
    req.user._id,
    "plan",
    rules.requireApproval ? "Plan pending review" : "Plan is live",
    rules.requireApproval ? "Your weekly plan is ready for admin review." : "Your approved weekly sessions are ready."
  );

  res.status(StatusCodes.CREATED).json(new ApiResponse("Weekly plan generated", plan));
});

const getCurrentPlan = asyncHandler(async (req, res) => {
  const requestedDate = req.query.weekStart ? new Date(String(req.query.weekStart)) : new Date();
  const bounds = getWeekBounds(Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate);
  const approvedPlan = await WeeklyPlan.findOne({
    user: req.user._id,
    weekKey: bounds.weekKey,
    status: { $in: ["approved", "live"] }
  }).lean();
  if (approvedPlan) {
    return res.json(new ApiResponse("Current weekly plan", { ...approvedPlan, playerVisibility: "live" }));
  }

  if (String(req.query.includePending) === "true") {
    const pendingPlan = await WeeklyPlan.findOne({
      user: req.user._id,
      weekKey: bounds.weekKey,
      status: { $in: ["draft", "pending_review"] }
    }).lean();
    return res.json(new ApiResponse("Current weekly plan", pendingPlan ? { ...pendingPlan, playerVisibility: "pending" } : null));
  }

  return res.json(new ApiResponse("Current weekly plan", null));
});

const regeneratePlan = asyncHandler(async (req, res) => {
  const bounds = getWeekBounds();
  await checkPlanAllowance(req.user._id, bounds.weekKey);
  req.body.weekStart = bounds.weekStart;
  return generatePlan(req, res);
});

const logWorkout = asyncHandler(async (req, res) => {
  const log = await WorkoutLog.create({
    user: req.user._id,
    weeklyPlan: req.body.weeklyPlan,
    sessionId: req.body.sessionId,
    performedAt: req.body.performedAt || new Date(),
    title: req.body.title,
    durationMin: req.body.durationMin,
    exercises: req.body.exercises || [],
    rpe: req.body.rpe,
    soreness: req.body.soreness,
    notes: req.body.notes,
    trainingLoad: req.body.trainingLoad || (req.body.durationMin || 0) * (req.body.rpe || 5)
  });

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "session_completed",
    feature: "Workout Runner",
    metadata: { weeklyPlan: log.weeklyPlan, sessionId: log.sessionId, durationMin: log.durationMin, trainingLoad: log.trainingLoad }
  });

  res.status(StatusCodes.CREATED).json(new ApiResponse("Workout logged", { log, readiness }));
});

const listWorkoutLogs = asyncHandler(async (req, res) => {
  const logs = await WorkoutLog.find({ user: req.user._id }).sort({ performedAt: -1 }).limit(100);
  res.json(new ApiResponse("Workout logs", logs));
});

const updateWorkoutLog = asyncHandler(async (req, res) => {
  const allowed = ["rpe", "soreness", "notes", "durationMin", "exercises"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }
  if (updates.durationMin !== undefined || updates.rpe !== undefined) {
    const current = await WorkoutLog.findOne({ _id: req.params.id, user: req.user._id });
    if (!current) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Workout log not found");
    }
    const durationMin = updates.durationMin ?? current.durationMin ?? 0;
    const rpe = updates.rpe ?? current.rpe ?? 5;
    updates.trainingLoad = durationMin * rpe;
  }

  const log = await WorkoutLog.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: updates },
    { new: true }
  );
  if (!log) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Workout log not found");
  }

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  res.json(new ApiResponse("Workout log updated", { log, readiness }));
});

const addProgressEntry = asyncHandler(async (req, res) => {
  const entry = await ProgressEntry.create({
    user: req.user._id,
    type: req.body.type,
    metric: req.body.metric,
    value: req.body.value,
    unit: req.body.unit,
    notes: req.body.notes,
    metadata: req.body.metadata,
    recordedAt: req.body.recordedAt || new Date()
  });

  const readiness = ["sleep", "recovery"].includes(entry.type) ? await calculateReadiness(req.user) : null;
  if (readiness) {
    await User.findByIdAndUpdate(req.user._id, { readiness });
  }

  res.status(StatusCodes.CREATED).json(new ApiResponse("Progress entry added", { entry, readiness }));
});

const getInsights = asyncHandler(async (req, res) => {
  const [logs, progress] = await Promise.all([
    WorkoutLog.find({ user: req.user._id }).sort({ performedAt: -1 }).limit(50).lean(),
    ProgressEntry.find({ user: req.user._id }).sort({ recordedAt: -1 }).limit(100).lean()
  ]);

  const liftLogs = logs.flatMap((log) =>
    (log.exercises || []).map((exercise) => ({
      name: exercise.name,
      volume: (exercise.weightKg || 0) * (exercise.reps || 0),
      performedAt: log.performedAt
    }))
  );

  const prs = {};
  for (const item of liftLogs) {
    prs[item.name] = Math.max(prs[item.name] || 0, item.volume);
  }

  res.json(
    new ApiResponse("Progress and insights", {
      logs,
      progress,
      personalRecords: prs
    })
  );
});

function buildCoachFallback({ readiness, plan }) {
  const recoveryLow = (readiness.components?.recovery || 0) < 65;
  const planCount = plan?.sessions?.length || 0;
  return [
    `Your readiness is ${readiness.score}.`,
    recoveryLow
      ? "Prioritize sleep quality, hydration, and low-intensity mobility today."
      : "Stay consistent with your current plan and keep your next session sharp but controlled.",
    `Your latest weekly plan has ${planCount} scheduled sessions.`
  ].join(" ");
}

function formatCoachContext({ user, readiness, plan, recentWorkouts, nutritionLog, upcomingMatch }) {
  return {
    athlete: {
      name: user.fullName,
      position: user.position,
      goals: user.goals || [],
      onboarding: user.onboarding?.answers || {},
      constraints: user.constraints || {}
    },
    readiness,
    latestPlan: plan
      ? {
          status: plan.status,
          source: plan.source,
          sessions: (plan.sessions || []).slice(0, 7).map((session) => ({
            dayLabel: session.dayLabel,
            title: session.title,
            type: session.type,
            focus: session.focus,
            durationMin: session.durationMin,
            intensity: session.intensity,
            exerciseCount: session.exercises?.length || 0
          }))
        }
      : null,
    recentWorkouts: recentWorkouts.map((log) => ({
      title: log.title,
      performedAt: log.performedAt,
      durationMin: log.durationMin,
      rpe: log.rpe,
      soreness: log.soreness,
      trainingLoad: log.trainingLoad
    })),
    nutritionToday: nutritionLog
      ? {
          totals: nutritionLog.totals,
          dailyTargets: nutritionLog.dailyTargets,
          mealsLogged: nutritionLog.meals?.length || 0
        }
      : null,
    upcomingMatch: upcomingMatch
      ? {
          opponent: upcomingMatch.opponent,
          dateTime: upcomingMatch.dateTime,
          venue: upcomingMatch.venue,
          competitionType: upcomingMatch.competitionType
        }
      : null
  };
}

const aiCoachChat = asyncHandler(async (req, res) => {
  const message = req.body.message?.trim();
  if (!message) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Message is required");
  }

  const bounds = getWeekBounds();
  const usageLog = await AIUsageLog.create({
    user: req.user._id,
    type: "chat",
    weekKey: bounds.weekKey,
    charged: false,
    requestSummary: message.slice(0, 120)
  });

  const today = dayjs().startOf("day").toDate();
  const [plan, readiness, recentWorkouts, nutritionLog, upcomingMatch] = await Promise.all([
    WeeklyPlan.findOne({ user: req.user._id }).sort({ weekStart: -1 }).lean(),
    calculateReadiness(req.user),
    WorkoutLog.find({ user: req.user._id }).sort({ performedAt: -1 }).limit(5).lean(),
    NutritionLog.findOne({ user: req.user._id, date: today }).lean(),
    Match.findOne({ user: req.user._id, status: "scheduled", dateTime: { $gte: new Date() } })
      .sort({ dateTime: 1 })
      .lean()
  ]);

  const context = formatCoachContext({
    user: req.user,
    readiness,
    plan,
    recentWorkouts,
    nutritionLog,
    upcomingMatch
  });
  const history = Array.isArray(req.body.history)
    ? req.body.history.slice(-8).map((item) => ({
        role: item.role === "coach" || item.role === "assistant" ? "assistant" : "user",
        content: String(item.text || item.content || "").slice(0, 1000)
      }))
    : [];

  const fallback = buildCoachFallback({ readiness, plan });
  const aiResult = await generateText({
    purpose: "ai_coach_chat",
    temperature: 0.35,
    maxTokens: 650,
    system:
      "You are ProjectBaller's AI football performance coach. Give concise, practical coaching for training, recovery, nutrition, match prep, and habit execution. Use the provided athlete context. Do not invent data. If the user mentions pain, injury, illness, medication, or diagnosis, give conservative guidance and recommend a qualified professional. Keep replies mobile-friendly and action-oriented.",
    messages: [
      {
        role: "user",
        content: `Athlete context JSON:\n${JSON.stringify(context)}`
      },
      ...history,
      { role: "user", content: message }
    ],
    fallback
  });

  usageLog.status = aiResult.source === "openai" ? "success" : "fallback";
  usageLog.responseSummary = aiResult.content.slice(0, 240);
  usageLog.errorMessage = aiResult.errorMessage;
  await usageLog.save();
  await trackEvent({ user: req.user._id, source: "app", type: "ai_chat", feature: "AI Coach", metadata: { source: aiResult.source } });

  res.json(
    new ApiResponse("AI coach response", {
      answer: aiResult.content,
      source: aiResult.source,
      context: {
        readiness,
        planId: plan?._id || null
      }
    })
  );
});

const listWorkoutLibrary = asyncHandler(async (req, res) => {
  const filters = {};
  if (req.query.category) {
    filters.category = req.query.category;
  }
  if (req.query.equipment) {
    filters.equipment = req.query.equipment;
  }

  const exercises = await Exercise.find(filters).sort({ createdAt: -1 }).limit(250);
  res.json(new ApiResponse("Workout library", exercises));
});

module.exports = {
  generatePlan,
  getCurrentPlan,
  regeneratePlan,
  logWorkout,
  listWorkoutLogs,
  updateWorkoutLog,
  addProgressEntry,
  getInsights,
  aiCoachChat,
  listWorkoutLibrary
};
