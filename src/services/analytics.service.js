const AnalyticsEvent = require("../models/AnalyticsEvent");
const RevenueEvent = require("../models/RevenueEvent");

async function trackEvent({ user, type, source = "backend", feature, metadata = {}, occurredAt = new Date() }) {
  if (!type) return null;
  return AnalyticsEvent.create({ user, type, source, feature, metadata, occurredAt }).catch(() => null);
}

async function trackRevenueEvent({
  user,
  subscription,
  provider,
  type,
  amount,
  currency = "usd",
  status,
  externalCustomerId,
  externalSubscriptionId,
  metadata = {},
  occurredAt = new Date()
}) {
  if (!type) return null;
  return RevenueEvent.create({
    user,
    subscription,
    provider,
    type,
    amount,
    currency,
    status,
    externalCustomerId,
    externalSubscriptionId,
    metadata,
    occurredAt
  }).catch(() => null);
}

module.exports = { trackEvent, trackRevenueEvent };
