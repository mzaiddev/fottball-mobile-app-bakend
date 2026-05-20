const { StatusCodes } = require("http-status-codes");
const dayjs = require("dayjs");
const AdminRule = require("../models/AdminRule");
const AIUsageLog = require("../models/AIUsageLog");
const Exercise = require("../models/Exercise");
const Match = require("../models/Match");
const Notification = require("../models/Notification");
const NutritionLog = require("../models/NutritionLog");
const Recipe = require("../models/Recipe");
const RehabProtocol = require("../models/RehabProtocol");
const Subscription = require("../models/Subscription");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const WorkoutLog = require("../models/WorkoutLog");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function startOfMonth() {
  return dayjs().startOf("month").toDate();
}

const getDashboardStats = asyncHandler(async (req, res) => {
  const [users, subscriptions, pendingPlans, aiUsage, openTickets, recentUsers, queue] = await Promise.all([
    User.countDocuments(),
    Subscription.countDocuments({ status: { $in: ["trialing", "active"] } }),
    WeeklyPlan.countDocuments({ "adminReview.status": "pending" }),
    AIUsageLog.countDocuments(),
    SupportTicket.countDocuments({ status: { $ne: "resolved" } }),
    User.find().sort({ createdAt: -1 }).limit(5).lean(),
    WeeklyPlan.find({ "adminReview.status": "pending" }).populate("user", "fullName email position").sort({ createdAt: 1 }).limit(5).lean()
  ]);

  res.json(
    new ApiResponse("Admin dashboard stats", {
      users,
      activeSubscriptions: subscriptions,
      pendingPlans,
      aiUsage,
      openTickets,
      recentUsers,
      queue
    })
  );
});

const getAnalytics = asyncHandler(async (req, res) => {
  const monthStart = startOfMonth();
  const [users, activeUsers, workouts, matches, nutritionLogs, posts, aiChats, subscriptions] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ lastActiveAt: { $gte: dayjs().subtract(1, "day").toDate() } }),
    WorkoutLog.countDocuments({ createdAt: { $gte: monthStart } }),
    Match.countDocuments({ createdAt: { $gte: monthStart } }),
    NutritionLog.countDocuments({ createdAt: { $gte: monthStart } }),
    require("../models/CommunityPost").countDocuments({ createdAt: { $gte: monthStart } }),
    AIUsageLog.countDocuments({ type: "chat", createdAt: { $gte: monthStart } }),
    Subscription.find({ status: { $in: ["trialing", "active"] } }).lean()
  ]);

  const monthlyRevenue = subscriptions.reduce((sum, sub) => sum + Number(sub.amount || 0), 0);
  const featureUsage = [
    { name: "Weekly Plan", count: await WeeklyPlan.countDocuments({ createdAt: { $gte: monthStart } }) },
    { name: "Nutrition Logging", count: nutritionLogs },
    { name: "Match Day Hub", count: matches },
    { name: "Community", count: posts },
    { name: "AI Chat", count: aiChats }
  ];

  res.json(
    new ApiResponse("Analytics", {
      dau: activeUsers,
      users,
      monthlyRevenue,
      activeSubscriptions: subscriptions.length,
      averageSessionsPerUser: users ? Number((workouts / users).toFixed(2)) : 0,
      arpu: users ? Number((monthlyRevenue / users).toFixed(2)) : 0,
      featureUsage,
      revenueBars: Array.from({ length: 12 }, (_, index) => ({
        label: dayjs().subtract(11 - index, "month").format("MMM"),
        value: index === 11 ? monthlyRevenue : 0
      }))
    })
  );
});

const listAiLogs = asyncHandler(async (req, res) => {
  const logs = await AIUsageLog.find().populate("user", "fullName email").sort({ createdAt: -1 }).limit(200).lean();
  const monthLogs = logs.filter((item) => dayjs(item.createdAt).isAfter(dayjs().startOf("month")));
  const totalCalls = monthLogs.reduce((sum, item) => sum + Number(item.count || 1), 0);
  const capHits = monthLogs.filter((item) => item.status === "error").length;

  res.json(
    new ApiResponse("AI usage logs", {
      logs,
      summary: {
        totalCalls,
        estimatedTokens: totalCalls * 1200,
        estimatedCost: Number((totalCalls * 0.03).toFixed(2)),
        capHits
      }
    })
  );
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json(new ApiResponse("Users", users));
});

const updateUser = asyncHandler(async (req, res) => {
  const allowed = ["role", "fullName", "position", "playerTier", "xp"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
  res.json(new ApiResponse("User updated", user));
});

const inviteTeamMember = asyncHandler(async (req, res) => {
  const { fullName, email, role } = req.body;
  const password = req.body.password || `Baller-${Math.random().toString(36).slice(2, 10)}!`;
  const user = await User.create({
    fullName,
    email,
    password,
    role,
    acceptedTerms: true
  });

  res.status(StatusCodes.CREATED).json(new ApiResponse("Team member created", { user, temporaryPassword: password }));
});

const getPlanReviewQueue = asyncHandler(async (req, res) => {
  const plans = await WeeklyPlan.find({ "adminReview.status": "pending" }).populate("user", "fullName email position");
  res.json(new ApiResponse("Plan review queue", plans));
});

const approvePlan = asyncHandler(async (req, res) => {
  const plan = await WeeklyPlan.findByIdAndUpdate(
    req.params.id,
    {
      status: "approved",
      "adminReview.status": "approved",
      "adminReview.reviewedBy": req.user._id,
      "adminReview.reviewedAt": new Date(),
      "adminReview.notes": req.body.notes || ""
    },
    { new: true }
  );

  res.json(new ApiResponse("Plan approved", plan));
});

const regeneratePlanReview = asyncHandler(async (req, res) => {
  const plan = await WeeklyPlan.findByIdAndUpdate(
    req.params.id,
    {
      status: "pending_review",
      "adminReview.status": "regenerated",
      "adminReview.reviewedBy": req.user._id,
      "adminReview.reviewedAt": new Date(),
      "adminReview.notes": req.body.notes || "Regenerate requested"
    },
    { new: true }
  );

  res.json(new ApiResponse("Plan flagged for regeneration", plan));
});

const listRules = asyncHandler(async (req, res) => {
  const items = await AdminRule.find().sort({ category: 1, createdAt: -1 });
  res.json(new ApiResponse("Admin rules", items));
});

const createRule = asyncHandler(async (req, res) => {
  const item = await AdminRule.create({ ...req.body, createdBy: req.user._id });
  res.status(StatusCodes.CREATED).json(new ApiResponse("Rule created", item));
});

const updateRule = asyncHandler(async (req, res) => {
  const item = await AdminRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(new ApiResponse("Rule updated", item));
});

const listExercises = asyncHandler(async (req, res) => {
  const items = await Exercise.find({ isActive: { $ne: false } }).sort({ createdAt: -1 });
  res.json(new ApiResponse("Exercises", items));
});

const createExercise = asyncHandler(async (req, res) => {
  const slug = req.body.slug || slugify(req.body.name);
  const item = await Exercise.create({ ...req.body, slug });
  res.status(StatusCodes.CREATED).json(new ApiResponse("Exercise created", item));
});

const deleteExercise = asyncHandler(async (req, res) => {
  await Exercise.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json(new ApiResponse("Exercise removed", { id: req.params.id }));
});

const listRecipes = asyncHandler(async (req, res) => {
  const items = await Recipe.find({ isActive: { $ne: false } }).sort({ createdAt: -1 });
  res.json(new ApiResponse("Recipes", items));
});

const createRecipe = asyncHandler(async (req, res) => {
  const item = await Recipe.create(req.body);
  res.status(StatusCodes.CREATED).json(new ApiResponse("Recipe created", item));
});

const deleteRecipe = asyncHandler(async (req, res) => {
  await Recipe.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json(new ApiResponse("Recipe removed", { id: req.params.id }));
});

const listRehabProtocols = asyncHandler(async (req, res) => {
  const items = await RehabProtocol.find().sort({ injuryType: 1, phaseOrder: 1 });
  res.json(new ApiResponse("Rehab protocols", items));
});

const createRehabProtocol = asyncHandler(async (req, res) => {
  const item = await RehabProtocol.create(req.body);
  res.status(StatusCodes.CREATED).json(new ApiResponse("Rehab protocol created", item));
});

const deleteRehabProtocol = asyncHandler(async (req, res) => {
  await RehabProtocol.findByIdAndDelete(req.params.id);
  res.json(new ApiResponse("Rehab protocol removed", { id: req.params.id }));
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const items = await Subscription.find().populate("user", "fullName email").sort({ createdAt: -1 });
  res.json(new ApiResponse("Subscriptions", items));
});

const updateSubscription = asyncHandler(async (req, res) => {
  const item = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("user", "fullName email");
  res.json(new ApiResponse("Subscription updated", item));
});

const listSupportTickets = asyncHandler(async (req, res) => {
  const items = await SupportTicket.find().populate("user assignedTo replies.author", "fullName email").sort({ createdAt: -1 });
  res.json(new ApiResponse("Support tickets", items));
});

const updateSupportTicket = asyncHandler(async (req, res) => {
  const updates = { $set: {} };
  if (req.body.status) updates.$set.status = req.body.status;
  if (req.body.assignedTo) updates.$set.assignedTo = req.body.assignedTo;
  if (req.body.reply) {
    updates.$push = {
      replies: {
        author: req.user._id,
        body: req.body.reply
      }
    };
    if (!req.body.status) updates.$set.status = "in_progress";
  }
  if (!Object.keys(updates.$set).length) delete updates.$set;

  const item = await SupportTicket.findByIdAndUpdate(req.params.id, updates, { new: true }).populate("user assignedTo replies.author", "fullName email");
  res.json(new ApiResponse("Support ticket updated", item));
});

const listSentNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find().populate("user", "fullName email").sort({ createdAt: -1 }).limit(200);
  res.json(new ApiResponse("Admin notifications", items));
});

const sendNotification = asyncHandler(async (req, res) => {
  const { title, body, segment = "all", data } = req.body;
  const userFilter = {};
  if (segment === "trial") {
    const trialSubs = await Subscription.find({ status: "trialing" }).select("user").lean();
    userFilter._id = { $in: trialSubs.map((item) => item.user) };
  } else if (segment === "pro") {
    const proSubs = await Subscription.find({ status: "active" }).select("user").lean();
    userFilter._id = { $in: proSubs.map((item) => item.user) };
  }

  const users = await User.find(userFilter).select("_id").lean();
  const notifications = await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      type: "admin",
      title,
      body,
      data: { ...(data || {}), segment },
      sentAt: new Date()
    }))
  );

  res.status(StatusCodes.CREATED).json(new ApiResponse("Notification sent", { sent: notifications.length, notifications }));
});

const getGamification = asyncHandler(async (req, res) => {
  const leaderboard = await User.find().sort({ xp: -1 }).limit(20).select("fullName email xp playerTier").lean();
  const tiers = await User.aggregate([{ $group: { _id: "$playerTier", count: { $sum: 1 } } }]);
  res.json(new ApiResponse("Gamification", { leaderboard, tiers }));
});

module.exports = {
  getDashboardStats,
  getAnalytics,
  listAiLogs,
  listUsers,
  updateUser,
  inviteTeamMember,
  getPlanReviewQueue,
  approvePlan,
  regeneratePlanReview,
  listRules,
  createRule,
  updateRule,
  listExercises,
  createExercise,
  deleteExercise,
  listRecipes,
  createRecipe,
  deleteRecipe,
  listRehabProtocols,
  createRehabProtocol,
  deleteRehabProtocol,
  listSubscriptions,
  updateSubscription,
  listSupportTickets,
  updateSupportTicket,
  listSentNotifications,
  sendNotification,
  getGamification
};
