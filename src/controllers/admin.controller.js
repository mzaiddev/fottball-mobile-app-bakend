const { StatusCodes } = require("http-status-codes");
const dayjs = require("dayjs");
const AdminRule = require("../models/AdminRule");
const AIUsageLog = require("../models/AIUsageLog");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Exercise = require("../models/Exercise");
const Match = require("../models/Match");
const Notification = require("../models/Notification");
const NutritionLog = require("../models/NutritionLog");
const Recipe = require("../models/Recipe");
const RehabProtocol = require("../models/RehabProtocol");
const Subscription = require("../models/Subscription");
const RevenueEvent = require("../models/RevenueEvent");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const WeeklyPlan = require("../models/WeeklyPlan");
const WorkoutLog = require("../models/WorkoutLog");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const {
  buildPaginatedResponse,
  isPaginatedRequest,
  parsePagination,
} = require("../utils/pagination");
const { getMonthlyTokenBudget } = require("../services/aiUsage.service");
const { notifyUser } = require("../services/notification.service");
const { updateManualSubscription } = require("../services/billing.service");

const STAFF_ROLES = ["owner", "admin", "coach", "moderator", "support"];

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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function sendListResponse(
  req,
  res,
  message,
  query,
  countQuery,
  { defaultLimit = 10, maxLimit = 100, legacyLimit = 200 } = {},
) {
  if (isPaginatedRequest(req.query)) {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit,
      maxLimit,
    });
    const [items, total] = await Promise.all([
      query.skip(skip).limit(limit),
      countQuery,
    ]);
    return res.json(
      new ApiResponse(
        message,
        buildPaginatedResponse(items, total, page, limit),
      ),
    );
  }

  const items = await query.limit(legacyLimit);
  return res.json(new ApiResponse(message, items));
}

const getDashboardStats = asyncHandler(async (req, res) => {
  const paginatedDashboard =
    req.query.queuePage ||
    req.query.queueLimit ||
    req.query.recentUsersPage ||
    req.query.recentUsersLimit;
  const queueFilter = { "adminReview.status": "pending" };
  const recentUsersPage = parsePagination(
    { page: req.query.recentUsersPage, limit: req.query.recentUsersLimit },
    { defaultLimit: 5, maxLimit: 50 },
  );
  const queuePage = parsePagination(
    { page: req.query.queuePage, limit: req.query.queueLimit },
    { defaultLimit: 5, maxLimit: 50 },
  );
  const [
    users,
    subscriptions,
    pendingPlans,
    aiUsage,
    openTickets,
    recentUsers,
    recentUsersTotal,
    queue,
    queueTotal,
  ] = await Promise.all([
    User.countDocuments(),
    Subscription.countDocuments({ status: { $in: ["trialing", "active"] } }),
    WeeklyPlan.countDocuments(queueFilter),
    AIUsageLog.countDocuments(),
    SupportTicket.countDocuments({ status: { $ne: "resolved" } }),
    User.find()
      .sort({ createdAt: -1 })
      .skip(paginatedDashboard ? recentUsersPage.skip : 0)
      .limit(paginatedDashboard ? recentUsersPage.limit : 5)
      .lean(),
    paginatedDashboard ? User.countDocuments() : Promise.resolve(0),
    WeeklyPlan.find(queueFilter)
      .populate("user", "fullName email position")
      .sort({ createdAt: 1 })
      .skip(paginatedDashboard ? queuePage.skip : 0)
      .limit(paginatedDashboard ? queuePage.limit : 5)
      .lean(),
    paginatedDashboard
      ? WeeklyPlan.countDocuments(queueFilter)
      : Promise.resolve(0),
  ]);

  res.json(
    new ApiResponse("Admin dashboard stats", {
      users,
      activeSubscriptions: subscriptions,
      pendingPlans,
      aiUsage,
      openTickets,
      recentUsers: paginatedDashboard
        ? buildPaginatedResponse(
            recentUsers,
            recentUsersTotal,
            recentUsersPage.page,
            recentUsersPage.limit,
          )
        : recentUsers,
      queue: paginatedDashboard
        ? buildPaginatedResponse(
            queue,
            queueTotal,
            queuePage.page,
            queuePage.limit,
          )
        : queue,
    }),
  );
});

const getAnalytics = asyncHandler(async (req, res) => {
  const monthStart = startOfMonth();
  const [
    users,
    activeUsers,
    workouts,
    matches,
    nutritionLogs,
    posts,
    aiChats,
    subscriptions,
    featureEvents,
    revenueEvents,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({
      lastActiveAt: { $gte: dayjs().subtract(1, "day").toDate() },
    }),
    WorkoutLog.countDocuments({ createdAt: { $gte: monthStart } }),
    Match.countDocuments({ createdAt: { $gte: monthStart } }),
    NutritionLog.countDocuments({ createdAt: { $gte: monthStart } }),
    require("../models/CommunityPost").countDocuments({
      createdAt: { $gte: monthStart },
    }),
    AIUsageLog.countDocuments({
      type: "chat",
      createdAt: { $gte: monthStart },
    }),
    Subscription.find({ status: { $in: ["trialing", "active"] } }).lean(),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: monthStart } } },
      { $group: { _id: "$feature", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    RevenueEvent.aggregate([
      {
        $match: {
          occurredAt: {
            $gte: dayjs().subtract(11, "month").startOf("month").toDate(),
          },
          type: {
            $in: [
              "checkout_completed",
              "trial_converted",
              "renewed",
              "manual_update",
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$occurredAt" },
            month: { $month: "$occurredAt" },
          },
          value: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]),
  ]);

  const monthlyRevenue =
    revenueEvents
      .filter(
        (item) =>
          item._id.year === dayjs().year() &&
          item._id.month === dayjs().month() + 1,
      )
      .reduce((sum, item) => sum + Number(item.value || 0), 0) ||
    subscriptions.reduce((sum, sub) => sum + Number(sub.amount || 0), 0);
  const fallbackFeatureUsage = [
    {
      name: "Weekly Plan",
      count: await WeeklyPlan.countDocuments({
        createdAt: { $gte: monthStart },
      }),
    },
    { name: "Nutrition Logging", count: nutritionLogs },
    { name: "Match Day Hub", count: matches },
    { name: "Community", count: posts },
    { name: "AI Chat", count: aiChats },
  ];
  const featureUsage = featureEvents.length
    ? featureEvents.map((item) => ({
        name: item._id || "Unknown",
        count: item.count,
      }))
    : fallbackFeatureUsage;
  const paginatedFeatureUsage =
    req.query.featurePage || req.query.featureLimit
      ? (() => {
          const { page, limit, skip } = parsePagination(
            { page: req.query.featurePage, limit: req.query.featureLimit },
            { defaultLimit: 10, maxLimit: 50 },
          );
          return buildPaginatedResponse(
            featureUsage.slice(skip, skip + limit),
            featureUsage.length,
            page,
            limit,
          );
        })()
      : featureUsage;
  const revenueByMonth = new Map(
    revenueEvents.map((item) => [
      `${item._id.year}-${item._id.month}`,
      Number(item.value || 0),
    ]),
  );

  res.json(
    new ApiResponse("Analytics", {
      dau: activeUsers,
      users,
      monthlyRevenue,
      activeSubscriptions: subscriptions.length,
      averageSessionsPerUser: users ? Number((workouts / users).toFixed(2)) : 0,
      arpu: users ? Number((monthlyRevenue / users).toFixed(2)) : 0,
      featureUsage: paginatedFeatureUsage,
      revenueBars: Array.from({ length: 12 }, (_, index) => {
        const month = dayjs().subtract(11 - index, "month");
        return {
          label: month.format("MMM"),
          value:
            revenueByMonth.get(`${month.year()}-${month.month() + 1}`) || 0,
        };
      }),
    }),
  );
});

const listAiLogs = asyncHandler(async (req, res) => {
  const monthStart = startOfMonth();
  const [monthStats, budget] = await Promise.all([
    AIUsageLog.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: { $ifNull: ["$count", 1] } },
          estimatedTokens: {
            $sum: {
              $ifNull: ["$estimatedTokens", 0],
            },
          },
          capHits: {
            $sum: {
              $cond: [{ $eq: ["$status", "error"] }, 1, 0],
            },
          },
        },
      },
    ]),
    getMonthlyTokenBudget(),
  ]);
  const stats = monthStats[0] || {};
  const usedTokens = Number(stats.estimatedTokens || budget.usedTokens || 0);
  const summary = {
    totalCalls: Number(stats.totalCalls || 0),
    estimatedTokens: usedTokens,
    estimatedCost: Number(
      ((usedTokens / 1200) * 0.03).toFixed(2),
    ),
    capHits: Number(stats.capHits || 0),
    tokenCap: budget.tokenCap,
    remainingTokens: budget.remainingTokens,
  };

  if (isPaginatedRequest(req.query)) {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 10,
      maxLimit: 100,
    });
    const [logs, total] = await Promise.all([
      AIUsageLog.find()
        .populate("user", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AIUsageLog.countDocuments(),
    ]);

    return res.json(
      new ApiResponse("AI usage logs", {
        ...buildPaginatedResponse(logs, total, page, limit),
        summary,
      }),
    );
  }

  res.json(
    new ApiResponse("AI usage logs", {
      logs: await AIUsageLog.find()
        .populate("user", "fullName email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      summary,
    }),
  );
});

const listUsers = asyncHandler(async (req, res) => {
  const filters = {};
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filters.$or = [
      { fullName: regex },
      { email: regex },
      { position: regex },
      { role: regex },
    ];
  }
  if (req.query.filter === "staff") {
    filters.role = { $in: STAFF_ROLES };
  } else if (req.query.filter === "athletes") {
    filters.role = { $nin: STAFF_ROLES };
  } else if (req.query.filter === "risk") {
    filters["readiness.score"] = { $lt: 55 };
  }

  return sendListResponse(
    req,
    res,
    "Users",
    User.find(filters).sort({ createdAt: -1 }),
    User.countDocuments(filters),
  );
});

const updateUser = asyncHandler(async (req, res) => {
  const allowed = ["role", "fullName", "position", "playerTier", "xp"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
  });
  res.json(new ApiResponse("User updated", user));
});

const inviteTeamMember = asyncHandler(async (req, res) => {
  const { fullName, email, role } = req.body;
  const password =
    req.body.password || `Baller-${Math.random().toString(36).slice(2, 10)}!`;
  const user = await User.create({
    fullName,
    email,
    password,
    role,
    acceptedTerms: true,
  });

  res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse("Team member created", {
        user,
        temporaryPassword: password,
      }),
    );
});

const getPlanReviewQueue = asyncHandler(async (req, res) => {
  const filters = { "adminReview.status": "pending" };
  return sendListResponse(
    req,
    res,
    "Plan review queue",
    WeeklyPlan.find(filters)
      .populate("user", "fullName email position")
      .sort({ createdAt: 1 }),
    WeeklyPlan.countDocuments(filters),
  );
});

const approvePlan = asyncHandler(async (req, res) => {
  const plan = await WeeklyPlan.findByIdAndUpdate(
    req.params.id,
    {
      status: "approved",
      "adminReview.status": "approved",
      "adminReview.reviewedBy": req.user._id,
      "adminReview.reviewedAt": new Date(),
      "adminReview.notes": req.body.notes || "",
    },
    { new: true },
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
      "adminReview.notes": req.body.notes || "Regenerate requested",
    },
    { new: true },
  );

  res.json(new ApiResponse("Plan flagged for regeneration", plan));
});

const rejectPlan = asyncHandler(async (req, res) => {
  const plan = await WeeklyPlan.findByIdAndUpdate(
    req.params.id,
    {
      status: "draft",
      "adminReview.status": "rejected",
      "adminReview.reviewedBy": req.user._id,
      "adminReview.reviewedAt": new Date(),
      "adminReview.notes": req.body.notes || "Rejected from admin panel",
    },
    { new: true },
  );

  res.json(new ApiResponse("Plan rejected", plan));
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
  const item = await AdminRule.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.json(new ApiResponse("Rule updated", item));
});

const listExercises = asyncHandler(async (req, res) => {
  const filters = { isActive: { $ne: false } };
  if (String(req.query.hasVideo) === "true") {
    filters["video.url"] = { $exists: true, $nin: ["", null] };
  }

  return sendListResponse(
    req,
    res,
    "Exercises",
    Exercise.find(filters).sort({ createdAt: -1 }),
    Exercise.countDocuments(filters),
  );
});

const createExercise = asyncHandler(async (req, res) => {
  const slug = req.body.slug || slugify(req.body.name);
  const item = await Exercise.create({ ...req.body, slug });
  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Exercise created", item));
});

const deleteExercise = asyncHandler(async (req, res) => {
  await Exercise.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json(new ApiResponse("Exercise removed", { id: req.params.id }));
});

const listRecipes = asyncHandler(async (req, res) => {
  const filters = { isActive: { $ne: false } };
  return sendListResponse(
    req,
    res,
    "Recipes",
    Recipe.find(filters).sort({ createdAt: -1 }),
    Recipe.countDocuments(filters),
  );
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
  return sendListResponse(
    req,
    res,
    "Rehab protocols",
    RehabProtocol.find().sort({ injuryType: 1, phaseOrder: 1 }),
    RehabProtocol.countDocuments(),
  );
});

const createRehabProtocol = asyncHandler(async (req, res) => {
  const item = await RehabProtocol.create(req.body);
  res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse("Rehab protocol created", item));
});

const deleteRehabProtocol = asyncHandler(async (req, res) => {
  await RehabProtocol.findByIdAndDelete(req.params.id);
  res.json(new ApiResponse("Rehab protocol removed", { id: req.params.id }));
});

const listSubscriptions = asyncHandler(async (req, res) => {
  return sendListResponse(
    req,
    res,
    "Subscriptions",
    Subscription.find()
      .populate("user", "fullName email")
      .sort({ createdAt: -1 }),
    Subscription.countDocuments(),
  );
});

const updateSubscription = asyncHandler(async (req, res) => {
  const item = await updateManualSubscription(req.params.id, req.body);
  res.json(new ApiResponse("Subscription updated", item));
});

const listSupportTickets = asyncHandler(async (req, res) => {
  return sendListResponse(
    req,
    res,
    "Support tickets",
    SupportTicket.find()
      .populate("user assignedTo replies.author", "fullName email")
      .sort({ createdAt: -1 }),
    SupportTicket.countDocuments(),
  );
});

const updateSupportTicket = asyncHandler(async (req, res) => {
  const updates = { $set: {} };
  if (req.body.status) updates.$set.status = req.body.status;
  if (req.body.assignedTo) updates.$set.assignedTo = req.body.assignedTo;
  if (req.body.reply) {
    updates.$push = {
      replies: {
        author: req.user._id,
        body: req.body.reply,
      },
    };
    if (!req.body.status) updates.$set.status = "in_progress";
  }
  if (!Object.keys(updates.$set).length) delete updates.$set;

  const item = await SupportTicket.findByIdAndUpdate(req.params.id, updates, {
    new: true,
  }).populate("user assignedTo replies.author", "fullName email");
  res.json(new ApiResponse("Support ticket updated", item));
});

const listSentNotifications = asyncHandler(async (req, res) => {
  return sendListResponse(
    req,
    res,
    "Admin notifications",
    Notification.find()
      .populate("user", "fullName email")
      .sort({ createdAt: -1 }),
    Notification.countDocuments(),
  );
});

const sendNotification = asyncHandler(async (req, res) => {
  const { title, body, segment = "all", data } = req.body;
  const userFilter = {};
  if (segment === "trial") {
    const trialSubs = await Subscription.find({ status: "trialing" })
      .select("user")
      .lean();
    userFilter._id = { $in: trialSubs.map((item) => item.user) };
  } else if (segment === "pro") {
    const proSubs = await Subscription.find({ status: "active" })
      .select("user")
      .lean();
    userFilter._id = { $in: proSubs.map((item) => item.user) };
  }

  const users = await User.find(userFilter).select("_id").lean();
  const notifications = await Promise.all(
    users.map((user) =>
      notifyUser(user._id, "admin", title, body, { ...(data || {}), segment }),
    ),
  );

  res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse("Notification sent", {
        sent: notifications.length,
        notifications,
      }),
    );
});

const getGamification = asyncHandler(async (req, res) => {
  if (
    req.query.leaderboardPage ||
    req.query.leaderboardLimit ||
    req.query.tierPage ||
    req.query.tierLimit
  ) {
    const leaderboardPage = parsePagination(
      { page: req.query.leaderboardPage, limit: req.query.leaderboardLimit },
      { defaultLimit: 5, maxLimit: 50 },
    );
    const tierPage = parsePagination(
      { page: req.query.tierPage, limit: req.query.tierLimit },
      { defaultLimit: 5, maxLimit: 50 },
    );
    const allTiers = await User.aggregate([
      { $group: { _id: "$playerTier", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
    const [leaderboard, leaderboardTotal] = await Promise.all([
      User.find()
        .sort({ xp: -1 })
        .skip(leaderboardPage.skip)
        .limit(leaderboardPage.limit)
        .select("fullName email xp playerTier")
        .lean(),
      User.countDocuments(),
    ]);

    return res.json(
      new ApiResponse("Gamification", {
        leaderboard: buildPaginatedResponse(
          leaderboard,
          leaderboardTotal,
          leaderboardPage.page,
          leaderboardPage.limit,
        ),
        tiers: buildPaginatedResponse(
          allTiers.slice(tierPage.skip, tierPage.skip + tierPage.limit),
          allTiers.length,
          tierPage.page,
          tierPage.limit,
        ),
      }),
    );
  }

  const leaderboard = await User.find()
    .sort({ xp: -1 })
    .limit(20)
    .select("fullName email xp playerTier")
    .lean();
  const tiers = await User.aggregate([
    { $group: { _id: "$playerTier", count: { $sum: 1 } } },
  ]);
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
  rejectPlan,
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
  getGamification,
};
