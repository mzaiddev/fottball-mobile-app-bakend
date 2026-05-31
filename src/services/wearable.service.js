const dayjs = require("dayjs");
const { StatusCodes } = require("http-status-codes");
const HealthMetric = require("../models/HealthMetric");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

const { HEALTH_PROVIDERS, HEALTH_METRICS } = HealthMetric;
const MAX_SYNC_METRICS = 1000;
const DEFAULT_SUMMARY_DAYS = 14;

function assertProvider(provider) {
  if (!HEALTH_PROVIDERS.includes(provider)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Unsupported wearable provider");
  }
}

function normalizeMetric(item) {
  if (!item || typeof item !== "object") return null;
  const metric = String(item.metric || "").trim();
  if (!HEALTH_METRICS.includes(metric)) return null;

  const value = Number(item.value);
  const startDate = new Date(item.startDate);
  const endDate = new Date(item.endDate);
  if (!Number.isFinite(value) || value < 0) return null;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  if (endDate.getTime() < startDate.getTime()) return null;

  return {
    metric,
    value,
    unit: String(item.unit || "").trim().slice(0, 40) || "count",
    startDate,
    endDate,
    sourceName: item.sourceName ? String(item.sourceName).trim().slice(0, 120) : undefined,
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined
  };
}

function coerceMetrics(metrics) {
  if (!Array.isArray(metrics)) return [];
  return metrics.slice(0, MAX_SYNC_METRICS).map(normalizeMetric).filter(Boolean);
}

async function storeWearableMetrics({ userId, provider, metrics, device }) {
  assertProvider(provider);
  const normalized = coerceMetrics(metrics);
  const now = new Date();

  if (normalized.length) {
    await HealthMetric.bulkWrite(
      normalized.map((metric) => ({
        updateOne: {
          filter: {
            user: userId,
            provider,
            metric: metric.metric,
            startDate: metric.startDate,
            endDate: metric.endDate
          },
          update: {
            $set: {
              ...metric,
              user: userId,
              provider,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }

  const path = `wearableConnections.${provider}`;
  const metaPath = `wearableConnectionMeta.${provider}`;
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        [path]: true,
        [`${metaPath}.status`]: "connected",
        [`${metaPath}.deviceLabel`]: device?.label,
        [`${metaPath}.platform`]: device?.platform,
        [`${metaPath}.lastSyncedAt`]: now,
        [`${metaPath}.connectedAt`]: now,
        wearableLastSyncedAt: now,
        lastActiveAt: now
      }
    },
    { new: true }
  );

  return {
    user,
    storedCount: normalized.length,
    syncedAt: now
  };
}

async function disconnectWearable(userId, provider) {
  assertProvider(provider);
  const path = `wearableConnections.${provider}`;
  const metaPath = `wearableConnectionMeta.${provider}`;
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        [path]: false,
        [`${metaPath}.status`]: "disconnected",
        [`${metaPath}.disconnectedAt`]: new Date()
      }
    },
    { new: true }
  );
}

async function listMetrics(userId, { provider, days = DEFAULT_SUMMARY_DAYS } = {}) {
  const since = dayjs().subtract(Math.max(1, Number(days) || DEFAULT_SUMMARY_DAYS), "day").toDate();
  const query = {
    user: userId,
    startDate: { $gte: since }
  };
  if (provider) {
    assertProvider(provider);
    query.provider = provider;
  }

  return HealthMetric.find(query).sort({ startDate: -1 }).limit(1000).lean();
}

async function getWearableSummary(userId, days = 7) {
  const since = dayjs().subtract(Math.max(1, Number(days) || 7), "day").toDate();
  const rows = await HealthMetric.aggregate([
    {
      $match: {
        user: userId,
        startDate: { $gte: since }
      }
    },
    {
      $group: {
        _id: "$metric",
        total: { $sum: "$value" },
        average: { $avg: "$value" },
        count: { $sum: 1 },
        latestAt: { $max: "$endDate" }
      }
    }
  ]);

  return rows.reduce((summary, item) => {
    summary[item._id] = {
      total: item.total,
      average: item.average,
      count: item.count,
      latestAt: item.latestAt
    };
    return summary;
  }, {});
}

module.exports = {
  assertProvider,
  storeWearableMetrics,
  disconnectWearable,
  listMetrics,
  getWearableSummary,
  HEALTH_PROVIDERS,
  HEALTH_METRICS
};
