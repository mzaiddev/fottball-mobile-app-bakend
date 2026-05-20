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
  ]
};
