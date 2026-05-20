const { v4: uuid } = require("uuid");
const AdminRule = require("../models/AdminRule");
const RehabProtocol = require("../models/RehabProtocol");
const { generateStructuredJson } = require("./openai.service");

const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildDefaultHabits(rulePayload) {
  return (rulePayload?.defaultHabitTargets || [
    "8h sleep",
    "Hydration goal",
    "Protein target met"
  ]).map((item) => ({
    title: item,
    target: "daily",
    completed: false
  }));
}

function createTemplateSession(dayLabel, title, type, focus, durationMin, intensity, exercises = []) {
  return {
    sessionId: uuid(),
    dayLabel,
    title,
    type,
    focus,
    durationMin,
    intensity,
    notes: "",
    exercises
  };
}

async function buildFallbackPlan(user, constraints) {
  const trainingRules = await AdminRule.findOne({ category: "training", isActive: true }).lean();
  const rehabProtocols = constraints.injuries?.length
    ? await RehabProtocol.find({ injuryType: { $in: constraints.injuries } }).lean()
    : [];
  const habits = buildDefaultHabits(trainingRules?.payload);
  const sessions = [];

  for (const dayLabel of dayLabels) {
    if ((constraints.matchDays || []).includes(dayLabel)) {
      sessions.push(
        createTemplateSession(dayLabel, "Match Day", "match", "Competition", 90, "high", [
          { name: "Dynamic warm-up", sets: 1, reps: "12 min", restSec: 0, weightGuidance: "", notes: "" },
          { name: "Post-match recovery", sets: 1, reps: "15 min", restSec: 0, weightGuidance: "", notes: "" }
        ])
      );
      continue;
    }

    if ((constraints.teamTrainingDays || []).includes(dayLabel)) {
      sessions.push(
        createTemplateSession(dayLabel, "Team Training", "pitch", "Tactical + technical", 75, "moderate", [
          { name: "Activation", sets: 1, reps: "10 min", restSec: 0, notes: "" },
          { name: "Acceleration mechanics", sets: 4, reps: "15m", restSec: 60, notes: "" },
          { name: "Ball mastery circuit", sets: 4, reps: "90s", restSec: 45, notes: "" }
        ])
      );
      continue;
    }

    if (sessions.filter((session) => session.type === "gym").length < (constraints.gymDays || 2)) {
      sessions.push(
        createTemplateSession(dayLabel, "Strength & Conditioning", "gym", user.position || "Football performance", 60, "moderate", [
          { name: "Trap bar deadlift", sets: 4, reps: "5", restSec: 150, notes: "Leave 2 reps in reserve" },
          { name: "Rear-foot elevated split squat", sets: 3, reps: "6 each side", restSec: 90, notes: "" },
          { name: "Nordic hamstring", sets: 3, reps: "5", restSec: 90, notes: "" },
          { name: "Copenhagen plank", sets: 3, reps: "25s each side", restSec: 45, notes: "" }
        ])
      );
      continue;
    }

    sessions.push(
      createTemplateSession(dayLabel, "Recovery / Mobility", "recovery", "Recovery", 25, "low", [
        { name: "Mobility flow", sets: 1, reps: "10 min", restSec: 0, notes: "" },
        { name: "Zone 2 walk / bike", sets: 1, reps: "15 min", restSec: 0, notes: "" }
      ])
    );
  }

  if (rehabProtocols.length) {
    const firstRecoveryDay = sessions.find((session) => session.type === "recovery");
    if (firstRecoveryDay) {
      firstRecoveryDay.type = "rehab";
      firstRecoveryDay.title = `${rehabProtocols[0].injuryType} Rehab`;
      firstRecoveryDay.focus = rehabProtocols[0].phaseName;
      firstRecoveryDay.exercises = rehabProtocols[0].exercises.map((exercise) => ({
        ...exercise,
        restSec: 45,
        weightGuidance: ""
      }));
    }
  }

  return {
    goals: user.goals,
    constraints,
    source: "template",
    status: "pending_review",
    sessions: sessions.map((session) => ({ ...session, habits })),
    whyThis: "Balanced around team sessions, matches, recovery, and available gym days."
  };
}

async function generateWeeklyPlan(user, constraints) {
  const fallback = await buildFallbackPlan(user, constraints);

  return generateStructuredJson({
    system:
      "You generate safe weekly football performance plans. Respect match days, training days, gym availability, and injuries. Return JSON only.",
    prompt: `Create a weekly plan for this football athlete: ${JSON.stringify({
      position: user.position,
      goals: user.goals,
      onboarding: user.onboarding?.answers,
      constraints
    })}. Use this JSON shape: ${JSON.stringify(fallback)}.`,
    fallback
  });
}

module.exports = { generateWeeklyPlan };
