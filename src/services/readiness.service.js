const dayjs = require("dayjs");
const Match = require("../models/Match");
const NutritionLog = require("../models/NutritionLog");
const ProgressEntry = require("../models/ProgressEntry");
const WorkoutLog = require("../models/WorkoutLog");

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function calculateReadiness(user) {
  const now = new Date();
  const weekAgo = dayjs(now).subtract(7, "day").toDate();
  const [workouts, lastSleep, matches, nutrition] = await Promise.all([
    WorkoutLog.find({ user: user._id, performedAt: { $gte: weekAgo } }).lean(),
    ProgressEntry.findOne({ user: user._id, type: { $in: ["sleep", "recovery"] } }).sort({ recordedAt: -1 }).lean(),
    Match.find({ user: user._id }).sort({ dateTime: -1 }).limit(10).lean(),
    NutritionLog.findOne({ user: user._id }).sort({ date: -1 }).lean()
  ]);

  const trainingLoadSum = workouts.reduce((sum, item) => sum + (item.trainingLoad || (item.durationMin || 0) * (item.rpe || 5)), 0);
  const trainingLoadScore = clamp(100 - Math.abs(350 - trainingLoadSum) / 3);

  const recoveryValue = typeof lastSleep?.value === "number" ? lastSleep.value : 7;
  const soreness = typeof lastSleep?.metadata?.soreness === "number" ? lastSleep.metadata.soreness : 3;
  const recoveryScore = clamp(recoveryValue * 10 - soreness * 5 + 35);

  const nextMatch = matches.find((item) => new Date(item.dateTime) > now);
  const lastMatch = matches.find((item) => new Date(item.dateTime) <= now);
  const daysUntilMatch = nextMatch ? dayjs(nextMatch.dateTime).diff(now, "day") : 4;
  const daysSinceLastMatch = lastMatch ? dayjs(now).diff(lastMatch.dateTime, "day") : 5;
  const matchTimingScore = clamp(85 - Math.abs(3 - daysUntilMatch) * 8 + Math.min(daysSinceLastMatch, 5) * 2);

  const caloriesPct = nutrition?.dailyTargets?.calories
    ? (nutrition.totals.calories / nutrition.dailyTargets.calories) * 100
    : 70;
  const proteinPct = nutrition?.dailyTargets?.protein
    ? (nutrition.totals.protein / nutrition.dailyTargets.protein) * 100
    : 70;
  const hydrationPct = nutrition?.dailyTargets?.hydrationMl
    ? (nutrition.totals.hydrationMl / nutrition.dailyTargets.hydrationMl) * 100
    : 70;
  const nutritionScore = clamp((caloriesPct + proteinPct + hydrationPct) / 3);

  const finalScore = clamp(
    trainingLoadScore * 0.25 + recoveryScore * 0.3 + matchTimingScore * 0.2 + nutritionScore * 0.25
  );

  return {
    score: finalScore,
    components: {
      trainingLoad: trainingLoadScore,
      recovery: recoveryScore,
      matchTiming: matchTimingScore,
      nutritionHydration: nutritionScore
    },
    calculatedAt: now
  };
}

module.exports = { calculateReadiness };
