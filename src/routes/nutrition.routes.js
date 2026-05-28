const router = require("express").Router();
const controller = require("../controllers/nutrition.controller");
const { protect, requireActiveEntitlement } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

router.use(protect);
router.use(requireActiveEntitlement);
router.get("/today", controller.getTodayLog);
router.post("/meals", validateBody({
  name: { type: "string", required: true, max: 160 },
  mealType: { type: "string", required: true, enum: ["breakfast", "lunch", "snack", "dinner"] },
  calories: { type: "number", min: 0 },
  protein: { type: "number", min: 0 },
  carbs: { type: "number", min: 0 },
  fats: { type: "number", min: 0 },
  hydrationMl: { type: "number", min: 0 },
  recipeId: { type: "string", max: 80 }
}), controller.addMeal);
router.delete("/meals/:index", controller.removeMeal);
router.post("/hydration", validateBody({
  hydrationMl: { type: "number", required: true, min: 1, max: 5000 }
}), controller.addHydration);
router.delete("/hydration", controller.removeHydration);
router.post("/generate-meal-plan", controller.generateDailyMealPlan);
router.get("/recipes", controller.listRecipes);
router.post("/meal-swap", validateBody({
  recipeId: { type: "string", required: true, max: 80 }
}), controller.mealSwap);

module.exports = router;
