const mongoose = require("mongoose");

const recipeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    ingredients: [String],
    steps: [String],
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number,
    hydrationMl: Number,
    dietaryTags: [String],
    allergens: [String],
    sourceType: {
      type: String,
      enum: ["manual", "pdf", "database"],
      default: "manual"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Recipe", recipeSchema);
