const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const AIUsageLog = require("../models/AIUsageLog");
const Exercise = require("../models/Exercise");
const ProgressEntry = require("../models/ProgressEntry");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const WorkoutLog = require("../models/WorkoutLog");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { getWeekBounds } = require("../utils/date");
const { notifyUser } = require("../services/notification.service");
const { calculateReadiness } = require("../services/readiness.service");
const { generateWeeklyPlan } = require("../services/weekBuilder.service");

async function checkPlanAllowance(userId, weekKey, chargedType = "plan_generation") {
  const count = await AIUsageLog.countDocuments({
    user: userId,
    weekKey,
    type: chargedType,
    charged: true
  });

  if (count >= 2) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Weekly AI regeneration allowance reached");
  }
}

const generatePlan = asyncHandler(async (req, res) => {
  const { weekStart, matchDays, teamTrainingDays, gymDays, injuries, position } = req.body;
  const bounds = getWeekBounds(weekStart || new Date());
  await checkPlanAllowance(req.user._id, bounds.weekKey);

  const constraints = {
    matchDays: matchDays || req.user.onboarding?.answers?.matchDays || [],
    teamTrainingDays: teamTrainingDays || req.user.onboarding?.answers?.teamTrainingDays || [],
    gymDays: gymDays || req.user.onboarding?.answers?.gymDays || 2,
    injuries: injuries || req.user.constraints?.injuries || [],
    position: position || req.user.position
  };

  const generated = await generateWeeklyPlan(req.user, constraints);

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
      status: generated.status || "pending_review",
      sessions: generated.sessions || [],
      whyThis: generated.whyThis || "",
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
    requestSummary: "Weekly plan generation",
    responseSummary: `Generated ${plan.sessions.length} sessions`
  });

  await notifyUser(req.user._id, "plan", "Plan generated", "Your weekly plan is ready for admin review.");

  res.status(StatusCodes.CREATED).json(new ApiResponse("Weekly plan generated", plan));
});

const getCurrentPlan = asyncHandler(async (req, res) => {
  const bounds = getWeekBounds();
  const plan = await WeeklyPlan.findOne({ user: req.user._id, weekKey: bounds.weekKey });
  res.json(new ApiResponse("Current weekly plan", plan));
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

const aiCoachChat = asyncHandler(async (req, res) => {
  const bounds = getWeekBounds();
  await AIUsageLog.create({
    user: req.user._id,
    type: "chat",
    weekKey: bounds.weekKey,
    charged: false,
    requestSummary: req.body.message?.slice(0, 120) || "chat"
  });

  const plan = await WeeklyPlan.findOne({ user: req.user._id }).sort({ weekStart: -1 }).lean();
  const readiness = await calculateReadiness(req.user);
  const answer = `You are currently at a readiness score of ${readiness.score}. Focus on ${
    readiness.components.recovery < 65 ? "sleep and soreness management" : "executing your current plan consistently"
  }. Your latest weekly plan has ${plan?.sessions?.length || 0} sessions scheduled.`;

  res.json(
    new ApiResponse("AI coach response", {
      answer,
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
