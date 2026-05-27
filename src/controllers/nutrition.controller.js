const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const AIUsageLog = require("../models/AIUsageLog");
const NutritionLog = require("../models/NutritionLog");
const Recipe = require("../models/Recipe");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { getWeekBounds } = require("../utils/date");
const { calculateReadiness } = require("../services/readiness.service");
const {
  calculateTargets,
  generateMealPlan,
} = require("../services/nutrition.service");
const { getAdminRuleSettings } = require("../services/adminRules.service");
const {
  ensureMonthlyTokenBudget,
  estimateTokens,
} = require("../services/aiUsage.service");
const { trackEvent } = require("../services/analytics.service");

async function getOrCreateTodayLog(user) {
  const date = dayjs().startOf("day").toDate();
  let log = await NutritionLog.findOne({ user: user._id, date });
  if (!log) {
    const rules = await getAdminRuleSettings();
    log = await NutritionLog.create({
      user: user._id,
      date,
      dailyTargets: calculateTargets(user, rules),
      meals: [],
    });
  }
  return log;
}

function recalculateTotals(log) {
  const totals = log.meals.reduce(
    (acc, meal) => {
      acc.calories += meal.calories || 0;
      acc.protein += meal.protein || 0;
      acc.carbs += meal.carbs || 0;
      acc.fats += meal.fats || 0;
      acc.hydrationMl += meal.hydrationMl || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0, hydrationMl: 0 },
  );
  log.totals = totals;
}

const getTodayLog = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  res.json(new ApiResponse("Nutrition log", log));
});

const addMeal = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  log.meals.push(req.body);
  recalculateTotals(log);
  await log.save();

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "meal_logged",
    feature: "Nutrition Logging",
    metadata: { mealType: req.body.mealType },
  });

  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Meal logged", { log, readiness }));
});

const removeMeal = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  const index = Number.parseInt(req.params.index, 10);
  if (Number.isNaN(index) || index < 0 || index >= log.meals.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Meal item not found");
  }

  log.meals.splice(index, 1);
  recalculateTotals(log);
  await log.save();

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "hydration_logged",
    feature: "Nutrition Logging",
    metadata: { hydrationMl: req.body.hydrationMl },
  });
  res.json(new ApiResponse("Meal removed", { log, readiness }));
});

const addHydration = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  log.meals.push({
    name: "Hydration",
    mealType: "hydration",
    hydrationMl: Number(req.body.hydrationMl || 0),
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
  });
  recalculateTotals(log);
  await log.save();

  const readiness = await calculateReadiness(req.user);
  await User.findByIdAndUpdate(req.user._id, { readiness });

  res.json(new ApiResponse("Hydration added", { log, readiness }));
});

const generateDailyMealPlan = asyncHandler(async (req, res) => {
  const bounds = getWeekBounds();
  await ensureMonthlyTokenBudget("meal_generation");
  await AIUsageLog.create({
    user: req.user._id,
    type: "meal_generation",
    weekKey: bounds.weekKey,
    charged: true,
    estimatedTokens: estimateTokens("meal_generation"),
    requestSummary: "Daily meal plan request",
  });

  const rules = await getAdminRuleSettings();
  const targets = calculateTargets(req.user, rules);
  const plan = await generateMealPlan(req.user, targets);
  res.json(new ApiResponse("Meal plan generated", { targets, plan }));
});

const listRecipes = asyncHandler(async (req, res) => {
  const recipes = await Recipe.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(new ApiResponse("Recipes", recipes));
});

const mealSwap = asyncHandler(async (req, res) => {
  const { recipeId } = req.body;
  const current = await Recipe.findById(recipeId);
  const alternative = await Recipe.findOne({
    _id: { $ne: recipeId },
    calories: {
      $gte: (current?.calories || 0) - 100,
      $lte: (current?.calories || 0) + 100,
    },
    protein: {
      $gte: (current?.protein || 0) - 10,
      $lte: (current?.protein || 0) + 10,
    },
  });

  res.json(new ApiResponse("Meal swap generated", { current, alternative }));
});

module.exports = {
  getTodayLog,
  addMeal,
  removeMeal,
  addHydration,
  generateDailyMealPlan,
  listRecipes,
  mealSwap,
};
