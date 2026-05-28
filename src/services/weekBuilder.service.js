const { v4: uuid } = require("uuid");
const AdminRule = require("../models/AdminRule");
const RehabProtocol = require("../models/RehabProtocol");
const { getAdminRuleSettings } = require("./adminRules.service");
const { generateStructuredJson } = require("./openai.service");
const { DAY_LABELS: dayLabels, normalizeDayLabels } = require("../utils/weekdays");

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

function capDuration(durationMin, rules) {
  return Math.min(Number(rules.maxSession || 90), durationMin);
}

function createTemplateSession(dayLabel, title, type, focus, durationMin, intensity, exercises = [], rules = {}) {
  return {
    sessionId: uuid(),
    dayLabel,
    title,
    type,
    focus,
    durationMin: capDuration(durationMin, rules),
    intensity,
    notes: "",
    exercises
  };
}

async function buildFallbackPlan(user, constraints) {
  const rules = await getAdminRuleSettings();
  const normalizedConstraints = normalizePlanConstraints(constraints, rules);
  const trainingRules = await AdminRule.findOne({ category: "training", isActive: true }).lean();
  const rehabProtocols = normalizedConstraints.injuries?.length
    ? await RehabProtocol.find({ injuryType: { $in: normalizedConstraints.injuries } }).lean()
    : [];
  const habits = buildDefaultHabits(trainingRules?.payload);
  const sessions = [];

  let recoveryPlacedAfterMatch = 0;

  for (const dayLabel of dayLabels) {
    if (recoveryPlacedAfterMatch > 0 && !(normalizedConstraints.matchDays || []).includes(dayLabel)) {
      sessions.push(
        createTemplateSession(dayLabel, "Recovery / Mobility", "recovery", "Post-match recovery", 25, "low", [
          { name: "Mobility flow", sets: 1, reps: "10 min", restSec: 0, notes: "" },
          { name: "Easy flush bike", sets: 1, reps: "15 min", restSec: 0, notes: "" }
        ], rules)
      );
      recoveryPlacedAfterMatch -= 1;
      continue;
    }

    if ((normalizedConstraints.matchDays || []).includes(dayLabel)) {
      sessions.push(
        createTemplateSession(dayLabel, "Match Day", "match", "Competition", 90, "high", [
          { name: "Dynamic warm-up", sets: 1, reps: "12 min", restSec: 0, weightGuidance: "", notes: "" },
          { name: "Post-match recovery", sets: 1, reps: "15 min", restSec: 0, weightGuidance: "", notes: "" }
        ], rules)
      );
      recoveryPlacedAfterMatch = Number(rules.minRecovery || 0);
      continue;
    }

    if ((normalizedConstraints.teamTrainingDays || []).includes(dayLabel)) {
      sessions.push(
        createTemplateSession(dayLabel, "Team Training", "pitch", "Tactical + technical", 75, "moderate", [
          { name: "Activation", sets: 1, reps: "10 min", restSec: 0, notes: "" },
          { name: "Acceleration mechanics", sets: 4, reps: "15m", restSec: 60, notes: "" },
          { name: "Ball mastery circuit", sets: 4, reps: "90s", restSec: 45, notes: "" }
        ], rules)
      );
      continue;
    }

    if (sessions.filter((session) => session.type === "gym").length < (normalizedConstraints.gymDays ?? 2)) {
      sessions.push(
        createTemplateSession(dayLabel, "Strength & Conditioning", "gym", user.position || "Football performance", 60, "moderate", [
          { name: "Trap bar deadlift", sets: 4, reps: "5", restSec: 150, notes: "Leave 2 reps in reserve" },
          { name: "Rear-foot elevated split squat", sets: 3, reps: "6 each side", restSec: 90, notes: "" },
          { name: "Nordic hamstring", sets: 3, reps: "5", restSec: 90, notes: "" },
          { name: "Copenhagen plank", sets: 3, reps: "25s each side", restSec: 45, notes: "" }
        ], rules)
      );
      continue;
    }

    sessions.push(
      createTemplateSession(dayLabel, "Recovery / Mobility", "recovery", "Recovery", 25, "low", [
        { name: "Mobility flow", sets: 1, reps: "10 min", restSec: 0, notes: "" },
        { name: "Zone 2 walk / bike", sets: 1, reps: "15 min", restSec: 0, notes: "" }
      ], rules)
    );
  }

  if (rules.autoDeload) {
    const highCount = sessions.filter((session) => session.intensity === "high").length;
    if (highCount >= 2) {
      sessions
        .filter((session) => session.type === "gym")
        .slice(-1)
        .forEach((session) => {
          session.intensity = "low";
          session.title = "Deload Strength & Mobility";
          session.durationMin = Math.min(session.durationMin, 45);
          session.notes = "Auto-deload applied from admin rules because match/high days are stacked.";
        });
    }
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
    constraints: normalizedConstraints,
    source: "template",
    status: rules.requireApproval ? "pending_review" : "live",
    sessions: sessions.map((session) => ({ ...session, habits })),
    whyThis: "Balanced around team sessions, matches, recovery, and available gym days."
  };
}

async function generateWeeklyPlan(user, constraints) {
  const rules = await getAdminRuleSettings();
  const normalizedConstraints = normalizePlanConstraints(constraints, rules);
  const fallback = await buildFallbackPlan(user, normalizedConstraints);

  const result = await generateStructuredJson({
    system:
      "You generate safe weekly football performance plans. Respect match days, training days, gym availability, injuries, max session duration, recovery minimums, and admin approval settings. Return JSON only.",
    prompt: `Create a weekly plan for this football athlete: ${JSON.stringify({
      position: user.position,
      goals: user.goals,
      onboarding: user.onboarding?.answers,
      constraints: normalizedConstraints,
      adminRules: rules
    })}. Use this JSON shape: ${JSON.stringify(fallback)}.`,
    fallback,
    includeMeta: true
  });

  return {
    ...result.data,
    aiMeta: {
      source: result.source,
      model: result.model,
      usage: result.usage,
      errorMessage: result.errorMessage
    }
  };
}

function normalizePlanConstraints(constraints = {}, rules = {}) {
  const maxGym = Number.isFinite(Number(rules.maxGym)) ? Number(rules.maxGym) : 5;
  return {
    ...constraints,
    matchDays: normalizeDayLabels(constraints.matchDays),
    teamTrainingDays: normalizeDayLabels(constraints.teamTrainingDays),
    gymDays: Math.min(maxGym, Math.max(0, Number.isFinite(Number(constraints.gymDays)) ? Number(constraints.gymDays) : 2))
  };
}

module.exports = { generateWeeklyPlan };
