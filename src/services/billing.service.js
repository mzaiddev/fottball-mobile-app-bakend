const dayjs = require("dayjs");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { trackRevenueEvent } = require("./analytics.service");

const REVENUECAT_STATUS = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  NON_RENEWING_PURCHASE: "active",
  TRIAL_STARTED: "trialing",
  TRIAL_CONVERTED: "active",
  UNCANCELLATION: "active",
  CANCELLATION: "canceled",
  EXPIRATION: "expired",
  BILLING_ISSUE: "past_due",
  PRODUCT_CHANGE: "active",
  REFUND: "refunded"
};

function centsToAmount(value) {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Number((number / 100).toFixed(2)) : undefined;
}

function eventNameFromStatus(status, fallback) {
  const map = {
    active: fallback || "renewed",
    trialing: "trial_started",
    canceled: "canceled",
    expired: "expired",
    refunded: "refunded",
    past_due: "past_due"
  };
  return map[status] || fallback || "manual_update";
}

async function upsertRevenueCatSubscription(event = {}) {
  const user = event.app_user_id ? await User.findById(event.app_user_id) : null;
  if (!user) return null;

  const status = REVENUECAT_STATUS[event.type] || "active";
  const updates = {
    user: user._id,
    provider: "revenuecat",
    status,
    planId: event.product_id,
    planName: event.product_id || "Project Baller Plan",
    amount: event.price,
    currency: (event.currency || "usd").toLowerCase(),
    externalCustomerId: event.app_user_id,
    externalSubscriptionId: event.original_transaction_id || event.transaction_id,
    currentPeriodEnd: event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined,
    trialEndsAt: event.type === "TRIAL_STARTED" && event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined,
    entitlements: Object.keys(event.entitlement_ids || {}),
    metadata: event
  };

  if (status === "canceled") updates.canceledAt = new Date();
  if (status === "expired") updates.expiredAt = new Date();
  if (status === "active" && event.type === "RENEWAL") updates.lastRenewedAt = new Date();

  const subscription = await Subscription.findOneAndUpdate(
    { user: user._id, provider: "revenuecat" },
    { $set: updates },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await trackRevenueEvent({
    user: user._id,
    subscription: subscription._id,
    provider: "revenuecat",
    type: event.type === "INITIAL_PURCHASE" ? "checkout_completed" : eventNameFromStatus(status, "renewed"),
    amount: updates.amount,
    currency: updates.currency,
    status,
    externalCustomerId: updates.externalCustomerId,
    externalSubscriptionId: updates.externalSubscriptionId,
    metadata: event
  });

  return subscription;
}

async function upsertStripeSubscription(event) {
  const object = event.data.object;
  const customerEmail = object.customer_email || object.customer_details?.email;
  const user = customerEmail ? await User.findOne({ email: customerEmail }) : null;
  const subscriptionId = object.subscription || object.id;
  const statusByEvent = {
    "checkout.session.completed": object.mode === "subscription" ? "trialing" : "active",
    "customer.subscription.created": object.status === "trialing" ? "trialing" : "active",
    "customer.subscription.updated": object.status === "past_due" ? "past_due" : object.status === "canceled" ? "canceled" : "active",
    "customer.subscription.deleted": "canceled",
    "invoice.payment_failed": "past_due",
    "invoice.paid": "active",
    "charge.refunded": "refunded"
  };
  const status = statusByEvent[event.type] || "active";

  if (!user && !subscriptionId) return null;

  const subscription = await Subscription.findOneAndUpdate(
    { provider: "stripe", externalSubscriptionId: subscriptionId },
    {
      $set: {
        ...(user ? { user: user._id } : {}),
        provider: "stripe",
        status,
        planId: object.metadata?.priceId || object.plan?.id || object.lines?.data?.[0]?.price?.id || subscriptionId,
        planName: object.metadata?.planName || "Project Baller Plan",
        amount: centsToAmount(object.amount_total ?? object.amount_paid ?? object.amount_refunded),
        currency: (object.currency || "usd").toLowerCase(),
        trialEndsAt: object.trial_end ? new Date(object.trial_end * 1000) : undefined,
        currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000) : undefined,
        externalCustomerId: object.customer,
        externalSubscriptionId: subscriptionId,
        metadata: object,
        ...(status === "canceled" ? { canceledAt: new Date() } : {}),
        ...(status === "refunded" ? { expiredAt: new Date() } : {}),
        ...(event.type === "invoice.paid" ? { lastRenewedAt: new Date() } : {})
      }
    },
    { upsert: Boolean(user), new: true, setDefaultsOnInsert: true }
  );

  if (subscription) {
    await trackRevenueEvent({
      user: subscription.user,
      subscription: subscription._id,
      provider: "stripe",
      type: event.type === "checkout.session.completed" ? "checkout_completed" : eventNameFromStatus(status, "renewed"),
      amount: centsToAmount(object.amount_total ?? object.amount_paid ?? object.amount_refunded),
      currency: (object.currency || "usd").toLowerCase(),
      status,
      externalCustomerId: object.customer,
      externalSubscriptionId: subscriptionId,
      metadata: object
    });
  }

  return subscription;
}

async function updateManualSubscription(id, updates) {
  const subscription = await Subscription.findByIdAndUpdate(id, updates, { new: true }).populate("user", "fullName email");
  if (subscription) {
    await trackRevenueEvent({
      user: subscription.user?._id || subscription.user,
      subscription: subscription._id,
      provider: subscription.provider || "manual",
      type: "manual_update",
      amount: subscription.amount,
      currency: subscription.currency,
      status: subscription.status,
      externalCustomerId: subscription.externalCustomerId,
      externalSubscriptionId: subscription.externalSubscriptionId,
      metadata: updates
    });
  }
  return subscription;
}

async function syncExpiredSubscriptions() {
  const now = new Date();
  const result = await Subscription.updateMany(
    {
      status: { $in: ["trialing", "active", "past_due"] },
      currentPeriodEnd: { $lt: now }
    },
    { $set: { status: "expired", expiredAt: now } }
  );

  const staleTrials = await Subscription.updateMany(
    {
      status: "trialing",
      trialEndsAt: { $lt: dayjs().subtract(1, "day").toDate() }
    },
    { $set: { status: "expired", expiredAt: now } }
  );

  return { expired: result.modifiedCount || 0, trials: staleTrials.modifiedCount || 0 };
}

async function hasActiveEntitlement(userId) {
  const subscription = await Subscription.findOne({
    user: userId,
    status: { $in: ["trialing", "active"] },
    $or: [{ currentPeriodEnd: { $exists: false } }, { currentPeriodEnd: null }, { currentPeriodEnd: { $gte: new Date() } }]
  }).lean();
  return Boolean(subscription);
}

module.exports = {
  hasActiveEntitlement,
  syncExpiredSubscriptions,
  updateManualSubscription,
  upsertRevenueCatSubscription,
  upsertStripeSubscription
};
