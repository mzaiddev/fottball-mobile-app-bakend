const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const Match = require("../models/Match");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { calculateReadiness } = require("../services/readiness.service");

function getMatchPhase(dateTime) {
  const diff = dayjs(dateTime).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff === -1) return "MD+1";
  if (diff === 0) return "MD0";
  if (diff === 1) return "MD-1";
  if (diff === 2) return "MD-2";
  if (diff === 3) return "MD-3";
  return "SCHEDULED";
}

const createMatch = asyncHandler(async (req, res) => {
  const match = await Match.create({
    user: req.user._id,
    opponent: req.body.opponent,
    dateTime: req.body.dateTime,
    venue: req.body.venue,
    location: req.body.location,
    competitionType: req.body.competitionType,
    preparationChecklist: [
      { label: "Fuel for the day" },
      { label: "Mobility activation" },
      { label: "Sleep target" }
    ],
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

  res.status(StatusCodes.CREATED).json(new ApiResponse("Match created", match));
});

const listMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({ user: req.user._id }).sort({ dateTime: -1 });
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
  const plans = await WeeklyPlan.find({ user: req.user._id, status: { $in: ["approved", "live", "pending_review"] } });
  const matches = await Match.find({ user: req.user._id, dateTime: { $gte: dayjs().subtract(3, "day").toDate() } });

  for (const plan of plans) {
    for (const session of plan.sessions) {
      const isMatchWindow = matches.some((match) => session.dayLabel === dayjs(match.dateTime).format("dddd"));
      if (isMatchWindow && session.type === "gym") {
        session.type = "recovery";
        session.title = "Auto-adjusted recovery";
        session.intensity = "low";
      }
    }
    await plan.save();
  }

  res.json(new ApiResponse("Plans auto-adjusted around matches", { updatedPlans: plans.length }));
});

module.exports = {
  createMatch,
  listMatches,
  getMatchHub,
  logPerformance,
  getHistory,
  autoAdjustPlanAroundMatches
};
