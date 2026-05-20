const router = require("express").Router();
const controller = require("../controllers/nutrition.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);
router.get("/today", controller.getTodayLog);
router.post("/meals", controller.addMeal);
router.delete("/meals/:index", controller.removeMeal);
router.post("/hydration", controller.addHydration);
router.post("/generate-meal-plan", controller.generateDailyMealPlan);
router.get("/recipes", controller.listRecipes);
router.post("/meal-swap", controller.mealSwap);

module.exports = router;
