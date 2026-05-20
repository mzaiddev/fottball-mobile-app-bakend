const Recipe = require("../models/Recipe");
const { generateStructuredJson } = require("./openai.service");

function getActivityMultiplier(level) {
  const map = {
    low: 1.35,
    moderate: 1.55,
    high: 1.75,
    elite: 1.95
  };
  return map[level] || 1.55;
}

function getGoalAdjustment(goal) {
  const map = {
    lose_weight: -300,
    maintain: 0,
    gain_weight: 250
  };
  return map[goal] || 0;
}

function calculateTargets(user) {
  const age = user.onboarding?.answers?.age || 18;
  const weightKg = user.onboarding?.answers?.weightKg || 70;
  const heightCm = user.onboarding?.answers?.heightCm || 175;
  const gender = user.onboarding?.answers?.gender || "male";
  const activityLevel = user.onboarding?.answers?.activityLevel || "moderate";
  const goal = user.onboarding?.answers?.nutritionGoal || "maintain";

  const bmr =
    gender === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  const calories = Math.round(bmr * getActivityMultiplier(activityLevel) + getGoalAdjustment(goal));
  const protein = Math.round(weightKg * 2);
  const fats = Math.round(weightKg * 0.9);
  const carbs = Math.round((calories - protein * 4 - fats * 9) / 4);
  const hydrationMl = Math.round(weightKg * 40);

  return { calories, protein, carbs, fats, hydrationMl };
}

async function generateMealPlan(user, targets) {
  const recipes = await Recipe.find({ isActive: true }).limit(12).lean();
  const fallback = {
    breakfast: recipes[0]?.name || "Greek yogurt oats bowl",
    lunch: recipes[1]?.name || "Chicken rice performance bowl",
    dinner: recipes[2]?.name || "Salmon potatoes recovery plate",
    snack: recipes[3]?.name || "Fruit + whey shake",
    targets
  };

  return generateStructuredJson({
    system: "You create practical meal plans for footballers. Keep meals simple and aligned to macros.",
    prompt: `Create a one-day meal plan for a football athlete. User profile: ${JSON.stringify(
      user.onboarding?.answers || {}
    )}. Nutrition targets: ${JSON.stringify(targets)}. Available recipes: ${JSON.stringify(
      recipes.map((r) => ({ name: r.name, calories: r.calories, protein: r.protein }))
    )}.`,
    fallback
  });
}

module.exports = { calculateTargets, generateMealPlan };
