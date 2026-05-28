module.exports = {
  adminRules: [
    {
      category: "training",
      name: "Weekly Builder Guardrails",
      description: "Default training constraints for football athletes",
      payload: {
        maxHighIntensityDays: 3,
        defaultHabitTargets: [
          "8h sleep",
          "Hydration goal",
          "Protein target met",
          "Mobility / prehab",
          "Steps / recovery walk",
          "Post-training refuel"
        ]
      }
    },
    {
      category: "nutrition",
      name: "Match Day Nutrition",
      description: "Default MD-2 to MD+1 fueling heuristics",
      payload: {
        md2: "Slightly higher carbs",
        md1: "Moderate carbs, lower fiber",
        md0: "Simple pre-match meals + hydration",
        md1plus: "Protein + carbs recovery focus"
      }
    }
  ],
  rehabProtocols: [
    {
      injuryType: "Hamstring strain",
      phaseName: "Phase 1",
      phaseOrder: 1,
      entryCriteria: ["Pain under 4/10", "Can walk normally"],
      exitCriteria: ["Pain-free bridge hold", "Pain-free marching"],
      exercises: [
        { name: "Isometric bridge hold", sets: 3, reps: "30s", notes: "Easy effort" },
        { name: "Heel digs", sets: 3, reps: "10", notes: "Controlled" }
      ]
    },
    {
      injuryType: "Ankle sprain",
      phaseName: "Phase 1",
      phaseOrder: 1,
      entryCriteria: ["Swelling controlled", "Can bear weight"],
      exitCriteria: ["Single-leg balance 30s", "Pain-free calf raise"],
      exercises: [
        { name: "Ankle alphabet", sets: 2, reps: "1 round", notes: "Slow circles" },
        { name: "Supported calf raise", sets: 3, reps: "12", notes: "Pain-free range" }
      ]
    }
  ],
  recipes: [
    {
      name: "Greek yogurt oats bowl",
      description: "High-protein breakfast with slow carbs for training days.",
      ingredients: ["Greek yogurt", "rolled oats", "banana", "honey", "berries"],
      steps: ["Mix yogurt and oats", "Top with banana, berries, and honey"],
      calories: 520,
      protein: 34,
      carbs: 72,
      fats: 10,
      dietaryTags: ["breakfast", "high-protein", "training-day"],
      allergens: ["dairy"],
      sourceType: "database"
    },
    {
      name: "Chicken rice performance bowl",
      description: "Balanced lunch for match prep or post-training refuel.",
      ingredients: ["chicken breast", "rice", "olive oil", "mixed vegetables", "lemon"],
      steps: ["Grill chicken", "Serve over rice with vegetables and lemon"],
      calories: 680,
      protein: 48,
      carbs: 78,
      fats: 18,
      dietaryTags: ["lunch", "high-protein", "match-prep"],
      allergens: [],
      sourceType: "database"
    },
    {
      name: "Salmon potatoes recovery plate",
      description: "Recovery dinner with protein, omega fats, and steady carbs.",
      ingredients: ["salmon", "potatoes", "spinach", "olive oil", "yogurt sauce"],
      steps: ["Bake salmon", "Roast potatoes", "Serve with spinach and sauce"],
      calories: 720,
      protein: 44,
      carbs: 62,
      fats: 30,
      dietaryTags: ["dinner", "recovery", "omega-3"],
      allergens: ["fish", "dairy"],
      sourceType: "database"
    },
    {
      name: "Fruit whey shake",
      description: "Fast snack for topping up protein and carbs.",
      ingredients: ["whey protein", "milk", "banana", "berries"],
      steps: ["Blend all ingredients until smooth"],
      calories: 360,
      protein: 32,
      carbs: 46,
      fats: 6,
      dietaryTags: ["snack", "quick", "high-protein"],
      allergens: ["dairy"],
      sourceType: "database"
    }
  ]
};
