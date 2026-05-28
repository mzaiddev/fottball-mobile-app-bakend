const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const AIUsageLog = require("../models/AIUsageLog");
const ApiError = require("../utils/ApiError");
const { getAdminRuleSettings } = require("./adminRules.service");

function getUsageTokenTotal(usage) {
  return Number(usage?.total_tokens || usage?.totalTokens || 0);
}

async function getMonthlyTokenUsage() {
  const monthStart = dayjs().startOf("month").toDate();
  const [usage] = await AIUsageLog.aggregate([
    {
      $match: {
        createdAt: { $gte: monthStart },
        status: { $ne: "error" },
      },
    },
    {
      $group: {
        _id: null,
        estimatedTokens: {
          $sum: {
            $ifNull: ["$estimatedTokens", 0],
          },
        },
      },
    },
  ]);

  return Number(usage?.estimatedTokens || 0);
}

async function getMonthlyTokenBudget() {
  const [rules, usedTokens] = await Promise.all([
    getAdminRuleSettings(),
    getMonthlyTokenUsage(),
  ]);
  const tokenCap = Number(rules.tokenCap || 0);

  return {
    tokenCap,
    usedTokens,
    remainingTokens: tokenCap > 0 ? Math.max(0, tokenCap - usedTokens) : null,
  };
}

async function ensureMonthlyTokenBudget() {
  const budget = await getMonthlyTokenBudget();

  if (
    budget.tokenCap > 0 &&
    budget.usedTokens >= budget.tokenCap
  ) {
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      "Monthly AI token cap reached",
      {
        tokenCap: budget.tokenCap,
        usedTokens: budget.usedTokens,
        remainingTokens: budget.remainingTokens,
      },
    );
  }

  return budget;
}

module.exports = {
  ensureMonthlyTokenBudget,
  getUsageTokenTotal,
  getMonthlyTokenBudget,
  getMonthlyTokenUsage,
};
