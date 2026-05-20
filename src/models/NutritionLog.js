const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    name: String,
    mealType: String,
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number,
    hydrationMl: Number,
    barcode: String,
    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe"
    }
  },
  { _id: false }
);

const nutritionLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    dailyTargets: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fats: Number,
      hydrationMl: Number
    },
    meals: [mealSchema],
    totals: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
      hydrationMl: { type: Number, default: 0 }
    },
    matchDayPhase: String,
    notes: String
  },
  { timestamps: true }
);

nutritionLogSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("NutritionLog", nutritionLogSchema);
