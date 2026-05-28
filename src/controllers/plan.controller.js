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
const {
  ensureMonthlyTokenBudget,
  getUsageTokenTotal,
} = require("../services/aiUsage.service");
const { hasActiveEntitlement } = require("../services/billing.service");
const { trackEvent } = require("../services/analytics.service");
const { calculateReadiness } = require("../services/readiness.service");
const { calculateTargets } = require("../services/nutrition.service");
const { generateWeeklyPlan } = require("../services/weekBuilder.service");
const {
  generateStructuredJson,
  generateText,
} = require("../services/openai.service");
const { normalizeDayLabels } = require("../utils/weekdays");

async function checkPlanAllowance(
  userId,
  weekKey,
  chargedType = "plan_generation",
) {
  const rules = await getAdminRuleSettings();
  const count = await AIUsageLog.countDocuments({
    user: userId,
    weekKey,
    type: chargedType,
    charged: true,
  });

  if (count >= Number(rules.regens || 2)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Weekly AI regeneration allowance reached",
    );
  }
}

const generatePlan = asyncHandler(async (req, res) => {
  const {
    weekStart,
    matchDays,
    teamTrainingDays,
    gymDays,
    injuries,
    position,
  } = req.body;
  const bounds = getWeekBounds(weekStart || new Date());
  const entitled = await hasActiveEntitlement(req.user._id);
  if (!entitled) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      "An active trial or subscription is required to generate plans",
    );
  }
  await checkPlanAllowance(req.user._id, bounds.weekKey);
  await ensureMonthlyTokenBudget();
  const requestedGymDays = gymDays ?? req.user.onboarding?.answers?.gymDays;

  const constraints = {
    matchDays: normalizeDayLabels(
      matchDays || req.user.onboarding?.answers?.matchDays || [],
    ),
    teamTrainingDays: normalizeDayLabels(
      teamTrainingDays || req.user.onboarding?.answers?.teamTrainingDays || [],
    ),
    gymDays: Number.isFinite(Number(requestedGymDays))
      ? Number(requestedGymDays)
      : 2,
    injuries: injuries || req.user.constraints?.injuries || [],
    position: position || req.user.position,
  };

  const generated = await generateWeeklyPlan(req.user, constraints);
  const rules = await getAdminRuleSettings();
  const planStatus = rules.requireApproval
    ? "pending_review"
    : generated.status === "approved"
      ? "approved"
      : "live";
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
        notes: rules.requireApproval ? "" : "Auto-approved by Admin Rules",
      },
      aiMeta: {
        generatedAt: new Date(),
        source: generated.aiMeta?.source,
        model: generated.aiMeta?.model,
        usage: generated.aiMeta?.usage,
        errorMessage: generated.aiMeta?.errorMessage,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await AIUsageLog.create({
    user: req.user._id,
    type: "plan_generation",
    weekKey: bounds.weekKey,
    charged: true,
    limit: Number(rules.regens || 2),
    estimatedTokens: getUsageTokenTotal(generated.aiMeta?.usage),
    status: generated.aiMeta?.source === "openai" ? "success" : "fallback",
    requestSummary: "Weekly plan generation",
    responseSummary: `Generated ${plan.sessions.length} sessions`,
    errorMessage: generated.aiMeta?.errorMessage,
  });

  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "plan_generated",
    feature: "Weekly Plan",
    metadata: { weekKey: bounds.weekKey, status: plan.status },
  });
  await notifyUser(
    req.user._id,
    "plan",
    rules.requireApproval ? "Plan pending review" : "Plan is live",
    rules.requireApproval
      ? "Your weekly plan is ready for admin review."
      : "Your approved weekly sessions are ready.",
  );

  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Weekly plan generated", plan));
});

function normalizeNutritionGoal(goal) {
  const normalized = String(goal || "").toLowerCase();
  if (normalized.includes("lose")) return "lose_weight";
  if (normalized.includes("gain")) return "gain_weight";
  return "maintain";
}

function timelineWeeks(goalTimeline) {
  const normalized = String(goalTimeline || "").toLowerCase();
  if (normalized.includes("1 month")) return 4;
  if (normalized.includes("3 month")) return 12;
  if (normalized.includes("6 month")) return 24;
  return 8;
}

function buildPreviewUser(payload) {
  const answers = payload.answers || {};
  return {
    fullName: payload.name || "Player",
    position: answers.position || payload.position,
    goals: payload.goals || [],
    constraints: payload.constraints || {},
    onboarding: {
      answers: {
        ...answers,
        gender: answers.gender || "male",
        heightCm: Number(answers.heightCm) || 175,
        weightKg: Number(answers.weightKg) || 70,
        age: Number(answers.age) || 18,
        activityLevel: answers.activityLevel || "Moderately Active",
        nutritionGoal: normalizeNutritionGoal(
          answers.nutritionGoal || payload.weightGoal,
        ),
      },
    },
  };
}

function buildPlanPreview({ payload, user, targets }) {
  const answers = user.onboarding.answers;
  const currentWeight = Number(answers.weightKg) || 70;
  const heightM = (Number(answers.heightCm) || 175) / 100;
  const goal = normalizeNutritionGoal(answers.nutritionGoal);
  const weeks = timelineWeeks(payload.goalTimeline || answers.goalTimeline);
  const weeklyChange =
    goal === "lose_weight" ? -0.5 : goal === "gain_weight" ? 0.35 : 0;
  const targetWeight = Number(
    (currentWeight + weeklyChange * weeks).toFixed(1),
  );
  const healthyMin = Number((18.5 * heightM * heightM).toFixed(1));
  const healthyMax = Number((24.9 * heightM * heightM).toFixed(1));
  const bmi = Number((currentWeight / (heightM * heightM)).toFixed(1));

  return {
    targetWeight,
    weightRange: {
      min: healthyMin,
      max: healthyMax,
    },
    bmi: {
      current: bmi,
      targetMin: 18.5,
      targetMax: 24.9,
    },
    dailyTargets: targets,
    timeline: {
      weeks,
      weeklyChangeKg: Math.abs(weeklyChange),
    },
    summary: {
      focus: payload.holdback || payload.improve || "Consistent performance",
      source: "fallback",
      headline: "Your football performance plan is ready.",
      body: "This preview balances your onboarding answers with training, recovery, and nutrition targets.",
      highlights: [
        "Hit your daily macro targets consistently.",
        "Train around match and team training days.",
        "Keep recovery habits simple and repeatable.",
      ],
    },
  };
}

async function personalizePlanPreview({ payload, user, fallback }) {
  const aiPreview = await generateStructuredJson({
    system:
      "You create concise onboarding plan previews for football players. Keep the numeric values exactly as provided. Personalize the summary, highlights, and focus notes using the athlete profile. Return JSON only.",
    prompt: `Create a personalized ProjectBaller onboarding plan preview. Athlete payload: ${JSON.stringify(
      {
        name: user.fullName,
        position: user.position,
        goals: user.goals,
        answers: user.onboarding?.answers,
        constraints: user.constraints,
        requestedFocus: {
          improve: payload.improve,
          holdback: payload.holdback,
          weightGoal: payload.weightGoal,
          goalTimeline: payload.goalTimeline,
        },
      },
    )}. Numeric preview that must not be changed: ${JSON.stringify({
      targetWeight: fallback.targetWeight,
      weightRange: fallback.weightRange,
      bmi: fallback.bmi,
      dailyTargets: fallback.dailyTargets,
      timeline: fallback.timeline,
    })}. Return this exact shape: ${JSON.stringify(fallback)}.`,
    fallback,
    temperature: 0.25,
    maxTokens: 1200,
  });

  return {
    ...fallback,
    targetWeight: fallback.targetWeight,
    weightRange: fallback.weightRange,
    bmi: fallback.bmi,
    dailyTargets: fallback.dailyTargets,
    timeline: fallback.timeline,
    summary: {
      ...fallback.summary,
      ...(aiPreview.summary || {}),
      source: aiPreview.summary?.source === "fallback" ? "fallback" : "openai",
    },
  };
}

const previewOnboardingPlan = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const user = buildPreviewUser(payload);
  const targets = calculateTargets(user);
  const fallback = buildPlanPreview({ payload, user, targets });
  const preview = await personalizePlanPreview({ payload, user, fallback });

  res.json(new ApiResponse("Onboarding plan preview", preview));
});

const getCurrentPlan = asyncHandler(async (req, res) => {
  const requestedDate = req.query.weekStart
    ? new Date(String(req.query.weekStart))
    : new Date();
  const bounds = getWeekBounds(
    Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate,
  );
  const approvedPlan = await WeeklyPlan.findOne({
    user: req.user._id,
    weekKey: bounds.weekKey,
    status: { $in: ["approved", "live"] },
  }).lean();
  if (approvedPlan) {
    return res.json(
      new ApiResponse("Current weekly plan", {
        ...approvedPlan,
        playerVisibility: "live",
      }),
    );
  }

  if (String(req.query.includePending) === "true") {
    const pendingPlan = await WeeklyPlan.findOne({
      user: req.user._id,
      weekKey: bounds.weekKey,
      status: { $in: ["draft", "pending_review"] },
    }).lean();
    return res.json(
      new ApiResponse(
        "Current weekly plan",
        pendingPlan ? { ...pendingPlan, playerVisibility: "live" } : null,
      ),
    );
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
    trainingLoad:
      req.body.trainingLoad ||
      (req.body.durationMin || 0) * (req.body.rpe || 5),
  });

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "session_completed",
    feature: "Workout Runner",
    metadata: {
      weeklyPlan: log.weeklyPlan,
      sessionId: log.sessionId,
      durationMin: log.durationMin,
      trainingLoad: log.trainingLoad,
    },
  });

  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Workout logged", { log, readiness }));
});

const listWorkoutLogs = asyncHandler(async (req, res) => {
  const logs = await WorkoutLog.find({ user: req.user._id })
    .sort({ performedAt: -1 })
    .limit(100);
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
    const current = await WorkoutLog.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
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
    { new: true },
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
    recordedAt: req.body.recordedAt || new Date(),
  });

  const readiness = ["sleep", "recovery"].includes(entry.type)
    ? await calculateReadiness(req.user)
    : null;
  if (readiness) {
    await User.findByIdAndUpdate(req.user._id, { readiness });
  }

  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Progress entry added", { entry, readiness }));
});

const getInsights = asyncHandler(async (req, res) => {
  const [logs, progress] = await Promise.all([
    WorkoutLog.find({ user: req.user._id })
      .sort({ performedAt: -1 })
      .limit(50)
      .lean(),
    ProgressEntry.find({ user: req.user._id })
      .sort({ recordedAt: -1 })
      .limit(100)
      .lean(),
  ]);

  const liftLogs = logs.flatMap((log) =>
    (log.exercises || []).map((exercise) => ({
      name: exercise.name,
      volume: (exercise.weightKg || 0) * (exercise.reps || 0),
      performedAt: log.performedAt,
    })),
  );

  const prs = {};
  for (const item of liftLogs) {
    prs[item.name] = Math.max(prs[item.name] || 0, item.volume);
  }

  res.json(
    new ApiResponse("Progress and insights", {
      logs,
      progress,
      personalRecords: prs,
    }),
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
    `Your latest weekly plan has ${planCount} scheduled sessions.`,
  ].join(" ");
}

function formatCoachContext({
  user,
  readiness,
  plan,
  recentWorkouts,
  nutritionLog,
  upcomingMatch,
}) {
  return {
    athlete: {
      name: user.fullName,
      position: user.position,
      goals: user.goals || [],
      onboarding: user.onboarding?.answers || {},
      constraints: user.constraints || {},
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
            exerciseCount: session.exercises?.length || 0,
          })),
        }
      : null,
    recentWorkouts: recentWorkouts.map((log) => ({
      title: log.title,
      performedAt: log.performedAt,
      durationMin: log.durationMin,
      rpe: log.rpe,
      soreness: log.soreness,
      trainingLoad: log.trainingLoad,
    })),
    nutritionToday: nutritionLog
      ? {
          totals: nutritionLog.totals,
          dailyTargets: nutritionLog.dailyTargets,
          mealsLogged: nutritionLog.meals?.length || 0,
        }
      : null,
    upcomingMatch: upcomingMatch
      ? {
          opponent: upcomingMatch.opponent,
          dateTime: upcomingMatch.dateTime,
          venue: upcomingMatch.venue,
          competitionType: upcomingMatch.competitionType,
        }
      : null,
  };
}

const aiCoachChat = asyncHandler(async (req, res) => {
  const message = req.body.message?.trim();
  if (!message) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Message is required");
  }
  await ensureMonthlyTokenBudget();

  const bounds = getWeekBounds();
  const today = dayjs().startOf("day").toDate();
  const [plan, readiness, recentWorkouts, nutritionLog, upcomingMatch] =
    await Promise.all([
      WeeklyPlan.findOne({ user: req.user._id }).sort({ weekStart: -1 }).lean(),
      calculateReadiness(req.user),
      WorkoutLog.find({ user: req.user._id })
        .sort({ performedAt: -1 })
        .limit(5)
        .lean(),
      NutritionLog.findOne({ user: req.user._id, date: today }).lean(),
      Match.findOne({
        user: req.user._id,
        status: "scheduled",
        dateTime: { $gte: new Date() },
      })
        .sort({ dateTime: 1 })
        .lean(),
    ]);

  const context = formatCoachContext({
    user: req.user,
    readiness,
    plan,
    recentWorkouts,
    nutritionLog,
    upcomingMatch,
  });
  const history = Array.isArray(req.body.history)
    ? req.body.history.slice(-8).map((item) => ({
        role:
          item.role === "coach" || item.role === "assistant"
            ? "assistant"
            : "user",
        content: String(item.text || item.content || "").slice(0, 1000),
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
        content: `Athlete context JSON:\n${JSON.stringify(context)}`,
      },
      ...history,
      { role: "user", content: message },
    ],
    fallback,
  });

  await AIUsageLog.create({
    user: req.user._id,
    type: "chat",
    weekKey: bounds.weekKey,
    charged: true,
    estimatedTokens: getUsageTokenTotal(aiResult.usage),
    status: aiResult.source === "openai" ? "success" : "fallback",
    requestSummary: message.slice(0, 120),
    responseSummary: aiResult.content.slice(0, 240),
    errorMessage: aiResult.errorMessage,
  });
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "ai_chat",
    feature: "AI Coach",
    metadata: { source: aiResult.source },
  });

  res.json(
    new ApiResponse("AI coach response", {
      answer: aiResult.content,
      source: aiResult.source,
      context: {
        readiness,
        planId: plan?._id || null,
      },
    }),
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

  const exercises = await Exercise.find(filters)
    .sort({ createdAt: -1 })
    .limit(250);
  res.json(new ApiResponse("Workout library", exercises));
});

module.exports = {
  previewOnboardingPlan,
  generatePlan,
  getCurrentPlan,
  regeneratePlan,
  logWorkout,
  listWorkoutLogs,
  updateWorkoutLog,
  addProgressEntry,
  getInsights,
  aiCoachChat,
  listWorkoutLibrary,
};
