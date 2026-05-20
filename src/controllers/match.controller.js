const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const Match = require("../models/Match");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const { createDefaultPreparationChecklist } = require("../data/matchPrepChecklist");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { calculateReadiness } = require("../services/readiness.service");
const { normalizeDayLabel } = require("../utils/weekdays");

const DAY_ORDER = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6
};

function getMatchPhase(dateTime) {
  const diff = dayjs(dateTime).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff === -1) return "MD+1";
  if (diff === 0) return "MD0";
  if (diff === 1) return "MD-1";
  if (diff === 2) return "MD-2";
  if (diff === 3) return "MD-3";
  return "SCHEDULED";
}

function normalizePreparationChecklist(existing = []) {
  const defaultChecklist = createDefaultPreparationChecklist();
  return defaultChecklist.map((item) => {
    const saved = existing.find(
      (candidate) =>
        candidate.id === item.id ||
        candidate.title === item.title ||
        candidate.label === item.title ||
        candidate.label === item.label
    );
    return {
      ...item,
      completed: Boolean(saved?.completed),
      completedAt: saved?.completedAt || null
    };
  });
}

async function ensurePreparationChecklist(match) {
  const current = match.preparationChecklist || [];
  const normalized = normalizePreparationChecklist(current);
  const needsSave =
    normalized.length !== current.length ||
    current.some((item) => !item.id || !item.sectionId || !item.title);

  if (needsSave) {
    match.preparationChecklist = normalized;
    await match.save();
  }

  return match;
}

function createMatchPlanSession(match) {
  return {
    sessionId: `match-${match._id}`,
    dayLabel: dayjs(match.dateTime).format("dddd"),
    title: `Match vs ${match.opponent}`,
    type: "match",
    focus: match.competitionType || "Competition",
    durationMin: 90,
    intensity: "high",
    notes: match.location ? `Kick-off at ${match.location}` : "Match day",
    exercises: [
      { name: "Dynamic warm-up", sets: 1, reps: "12 min", restSec: 0, weightGuidance: "", notes: "" },
      { name: "Post-match recovery", sets: 1, reps: "15 min", restSec: 0, weightGuidance: "", notes: "" }
    ]
  };
}

function matchFallsInPlanWeek(plan, match) {
  const matchTime = new Date(match.dateTime).getTime();
  return matchTime >= new Date(plan.weekStart).getTime() && matchTime <= new Date(plan.weekEnd).getTime();
}

function applyMatchToPlan(plan, match) {
  const dayLabel = dayjs(match.dateTime).format("dddd");
  const existing = plan.sessions.find((session) => normalizeDayLabel(session.dayLabel) === dayLabel);
  const matchSession = createMatchPlanSession(match);

  if (existing) {
    existing.sessionId = existing.sessionId || matchSession.sessionId;
    existing.dayLabel = dayLabel;
    existing.title = matchSession.title;
    existing.type = "match";
    existing.focus = matchSession.focus;
    existing.durationMin = matchSession.durationMin;
    existing.intensity = matchSession.intensity;
    existing.notes = matchSession.notes;
    existing.exercises = matchSession.exercises;
    return true;
  }

  plan.sessions.push(matchSession);
  return true;
}

async function syncPlansAroundMatches(userId, matches) {
  const plans = await WeeklyPlan.find({
    user: userId,
    status: { $in: ["approved", "live", "pending_review", "draft"] }
  });

  let updatedPlans = 0;
  for (const plan of plans) {
    let changed = false;
    for (const match of matches) {
      if (matchFallsInPlanWeek(plan, match)) {
        changed = applyMatchToPlan(plan, match) || changed;
      }
    }
    if (changed) {
      plan.source = "system_adjusted";
      plan.sessions.sort(
        (a, b) =>
          (DAY_ORDER[normalizeDayLabel(a.dayLabel)] ?? 99) -
          (DAY_ORDER[normalizeDayLabel(b.dayLabel)] ?? 99)
      );
      await plan.save();
      updatedPlans += 1;
    }
  }

  return updatedPlans;
}

const createMatch = asyncHandler(async (req, res) => {
  const match = await Match.create({
    user: req.user._id,
    opponent: req.body.opponent,
    dateTime: req.body.dateTime,
    venue: req.body.venue,
    location: req.body.location,
    competitionType: req.body.competitionType,
    preparationChecklist: createDefaultPreparationChecklist(),
    gameDayChecklist: [
      { label: "Warm-up complete" },
      { label: "Hydration on track" },
      { label: "Pre-match meal complete" }
    ],
    recoveryChecklist: [
      { label: "Cooldown complete" },
      { label: "Recovery meal" },
      { label: "Log soreness and sleep" }
    ]
  });
  await syncPlansAroundMatches(req.user._id, [match]);

  res.status(StatusCodes.CREATED).json(new ApiResponse("Match created", match));
});

const listMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({ user: req.user._id }).sort({ dateTime: -1 });
  await Promise.all(matches.map((match) => ensurePreparationChecklist(match)));
  res.json(
    new ApiResponse(
      "Matches",
      matches.map((match) => ({
        ...match.toObject(),
        phase: getMatchPhase(match.dateTime)
      }))
    )
  );
});

const getMatchHub = asyncHandler(async (req, res) => {
  const match = await Match.findOne({ _id: req.params.id, user: req.user._id });
  if (!match) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Match not found");
  }
  await ensurePreparationChecklist(match);
  const phase = getMatchPhase(match.dateTime);

  res.json(
    new ApiResponse("Match hub", {
      match,
      phase,
      recommendations:
        phase === "MD-1"
          ? ["Light activation", "Hydrate well", "Prioritize sleep"]
          : phase === "MD0"
            ? ["Warm-up routine", "Meal timing", "Checklist before kick-off"]
            : ["Recovery workout", "Protein + carbs", "Sleep quality log"]
    })
  );
});

const updatePreparationChecklist = asyncHandler(async (req, res) => {
  const match = await Match.findOne({ _id: req.params.id, user: req.user._id });
  if (!match) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Match not found");
  }

  const completedIds = Array.isArray(req.body.completedIds) ? req.body.completedIds.map(String) : null;
  const updates = Array.isArray(req.body.items) ? req.body.items : null;
  const now = new Date();

  match.preparationChecklist = normalizePreparationChecklist(match.preparationChecklist).map((item) => {
    if (completedIds) {
      const completed = completedIds.includes(item.id);
      return {
        ...item,
        completed,
        completedAt: completed ? item.completedAt || now : null
      };
    }

    const update = updates?.find((candidate) => String(candidate.id) === item.id);
    if (!update) return item;

    const completed = Boolean(update.completed);
    return {
      ...item,
      completed,
      completedAt: completed ? item.completedAt || now : null
    };
  });

  await match.save();
  res.json(new ApiResponse("Preparation checklist updated", match));
});

const logPerformance = asyncHandler(async (req, res) => {
  const match = await Match.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    {
      performanceLog: req.body,
      status: "completed"
    },
    { new: true }
  );

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });

  res.json(new ApiResponse("Performance log saved", { match, readiness }));
});

const getHistory = asyncHandler(async (req, res) => {
  const matches = await Match.find({ user: req.user._id, status: "completed" }).sort({ dateTime: -1 }).lean();
  const summary = matches.reduce(
    (acc, item) => {
      acc.totalGoals += item.performanceLog?.goals || 0;
      acc.totalAssists += item.performanceLog?.assists || 0;
      acc.averageRating += item.performanceLog?.selfRating || 0;
      return acc;
    },
    { totalGoals: 0, totalAssists: 0, averageRating: 0 }
  );

  summary.averageRating = matches.length ? Number((summary.averageRating / matches.length).toFixed(2)) : 0;

  res.json(new ApiResponse("Match history", { matches, summary }));
});

const autoAdjustPlanAroundMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({
    user: req.user._id,
    status: "scheduled",
    dateTime: { $gte: dayjs().subtract(3, "day").toDate() }
  });
  const updatedPlans = await syncPlansAroundMatches(req.user._id, matches);

  res.json(new ApiResponse("Plans auto-adjusted around matches", { updatedPlans }));
});

module.exports = {
  createMatch,
  listMatches,
  getMatchHub,
  updatePreparationChecklist,
  logPerformance,
  getHistory,
  autoAdjustPlanAroundMatches
};
