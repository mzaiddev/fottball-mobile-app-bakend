const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
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
  getUsageTokenTotal,
} = require("../services/aiUsage.service");
const { trackEvent } = require("../services/analytics.service");

const MEAL_TYPES = new Set(["breakfast", "lunch", "snack", "dinner"]);

function targetsDiffer(current = {}, next = {}) {
  return ["calories", "protein", "carbs", "fats", "hydrationMl"].some(
    (key) => Number(current[key] || 0) !== Number(next[key] || 0),
  );
}

async function getOrCreateTodayLog(user) {
  const date = dayjs().startOf("day").toDate();
  const rules = await getAdminRuleSettings();
  const dailyTargets = calculateTargets(user, rules);
  let log = await NutritionLog.findOne({ user: user._id, date });
  if (!log) {
    log = await NutritionLog.create({
      user: user._id,
      date,
      dailyTargets,
      meals: [],
    });
  } else if (targetsDiffer(log.dailyTargets, dailyTargets)) {
    log.dailyTargets = dailyTargets;
    await log.save();
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

async function updateReadiness(user) {
  const readiness = await calculateReadiness(user);
  await User.findByIdAndUpdate(user._id, { readiness });
  return readiness;
}

async function buildMealPayload(body) {
  const mealType = String(body.mealType || "").toLowerCase();
  if (!MEAL_TYPES.has(mealType)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "mealType is invalid");
  }

  let recipe = null;
  if (body.recipeId) {
    if (!mongoose.Types.ObjectId.isValid(body.recipeId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "recipeId is invalid");
    }
    recipe = await Recipe.findOne({ _id: body.recipeId, isActive: true }).lean();
    if (!recipe) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Recipe not found");
    }
  }

  return {
    name: body.name || recipe?.name,
    mealType,
    calories: Number(body.calories ?? recipe?.calories ?? 0),
    protein: Number(body.protein ?? recipe?.protein ?? 0),
    carbs: Number(body.carbs ?? recipe?.carbs ?? 0),
    fats: Number(body.fats ?? recipe?.fats ?? 0),
    hydrationMl: Number(body.hydrationMl || recipe?.hydrationMl || 0),
    barcode: body.barcode,
    recipe: recipe?._id,
  };
}

const getTodayLog = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  res.json(new ApiResponse("Nutrition log", log));
});

const addMeal = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  const meal = await buildMealPayload(req.body);
  log.meals.push(meal);
  recalculateTotals(log);
  await log.save();

  const readiness = await updateReadiness(req.user);
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "meal_logged",
    feature: "Nutrition Logging",
    metadata: { mealType: meal.mealType, recipeId: meal.recipe },
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

  const [removed] = log.meals.splice(index, 1);
  recalculateTotals(log);
  await log.save();

  const readiness = await updateReadiness(req.user);
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "meal_removed",
    feature: "Nutrition Logging",
    metadata: { mealType: removed?.mealType, calories: removed?.calories || 0 },
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

  const readiness = await updateReadiness(req.user);
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "hydration_logged",
    feature: "Nutrition Logging",
    metadata: { hydrationMl: Number(req.body.hydrationMl || 0) },
  });

  res.json(new ApiResponse("Hydration added", { log, readiness }));
});

const removeHydration = asyncHandler(async (req, res) => {
  const log = await getOrCreateTodayLog(req.user);
  const index = [...log.meals]
    .map((meal, mealIndex) => ({ meal, mealIndex }))
    .reverse()
    .find((item) => item.meal.mealType === "hydration")?.mealIndex;

  if (index === undefined) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Hydration entry not found");
  }

  const [removed] = log.meals.splice(index, 1);
  recalculateTotals(log);
  await log.save();

  const readiness = await updateReadiness(req.user);
  await trackEvent({
    user: req.user._id,
    source: "app",
    type: "hydration_removed",
    feature: "Nutrition Logging",
    metadata: { hydrationMl: removed?.hydrationMl || 0 },
  });

  res.json(new ApiResponse("Hydration removed", { log, readiness }));
});

const generateDailyMealPlan = asyncHandler(async (req, res) => {
  const bounds = getWeekBounds();
  await ensureMonthlyTokenBudget();

  const rules = await getAdminRuleSettings();
  const targets = calculateTargets(req.user, rules);
  const { plan, aiMeta } = await generateMealPlan(req.user, targets);
  await AIUsageLog.create({
    user: req.user._id,
    type: "meal_generation",
    weekKey: bounds.weekKey,
    charged: true,
    estimatedTokens: getUsageTokenTotal(aiMeta?.usage),
    status: aiMeta?.source === "openai" ? "success" : "fallback",
    requestSummary: "Daily meal plan request",
    errorMessage: aiMeta?.errorMessage,
  });

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
  if (!mongoose.Types.ObjectId.isValid(recipeId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "recipeId is invalid");
  }
  const current = await Recipe.findById(recipeId);
  if (!current || current.isActive === false) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Recipe not found");
  }
  const alternative = await Recipe.findOne({
    _id: { $ne: recipeId },
    isActive: true,
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
  removeHydration,
  generateDailyMealPlan,
  listRecipes,
  mealSwap,
};
