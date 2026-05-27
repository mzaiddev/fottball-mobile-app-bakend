const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const AIUsageLog = require("../models/AIUsageLog");
const ApiError = require("../utils/ApiError");
const { getAdminRuleSettings } = require("./adminRules.service");

const ESTIMATED_TOKENS = {
  plan_generation: 1200,
  meal_generation: 900,
  chat: 700,
  system_adjustment: 800,
};

function estimateTokens(type, fallback = 1200) {
  return ESTIMATED_TOKENS[type] || fallback;
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
            $ifNull: [
              "$estimatedTokens",
              {
                $multiply: [
                  { $ifNull: ["$count", 1] },
                  ESTIMATED_TOKENS.plan_generation,
                ],
              },
            ],
          },
        },
      },
    },
  ]);

  return Number(usage?.estimatedTokens || 0);
}

async function getMonthlyTokenBudget() {
  const rules = await getAdminRuleSettings();
  const tokenCap = Number(rules.tokenCap || 0);
  const usedTokens = await getMonthlyTokenUsage();

  return {
    tokenCap,
    usedTokens,
    remainingTokens: tokenCap > 0 ? Math.max(0, tokenCap - usedTokens) : null,
  };
}

async function ensureMonthlyTokenBudget(type) {
  const requestedTokens = estimateTokens(type);
  const budget = await getMonthlyTokenBudget();

  if (
    budget.tokenCap > 0 &&
    budget.usedTokens + requestedTokens > budget.tokenCap
  ) {
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      "Monthly AI token cap reached",
      {
        tokenCap: budget.tokenCap,
        usedTokens: budget.usedTokens,
        remainingTokens: budget.remainingTokens,
        requestedTokens,
      },
    );
  }

  return {
    ...budget,
    requestedTokens,
  };
}

module.exports = {
  ESTIMATED_TOKENS,
  ensureMonthlyTokenBudget,
  estimateTokens,
  getMonthlyTokenBudget,
  getMonthlyTokenUsage,
};
