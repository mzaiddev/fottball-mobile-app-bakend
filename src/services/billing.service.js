const dayjs = require("dayjs");
const Notification = require("../models/Notification");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { trackRevenueEvent } = require("./analytics.service");
const { notifyUser } = require("./notification.service");
const { stripe } = require("./payment.service");

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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function stripeDate(seconds) {
  return seconds ? new Date(seconds * 1000) : undefined;
}

function getStringId(value) {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id || value._id?.toString();
}

function getStripeSubscriptionId(object = {}) {
  return (
    getStringId(object.subscription) ||
    getStringId(object.parent?.subscription_details?.subscription) ||
    getStringId(object.subscription_details?.subscription) ||
    getStringId(object.lines?.data?.[0]?.subscription) ||
    getStringId(object.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ||
    (object.object === "subscription" ? object.id : undefined)
  );
}

function getStripeCustomerId(object = {}, subscriptionObject = {}) {
  return getStringId(object.customer) || getStringId(subscriptionObject.customer);
}

function getStripePrice(object = {}, subscriptionObject = {}) {
  return (
    subscriptionObject.items?.data?.[0]?.price ||
    object.items?.data?.[0]?.price ||
    object.lines?.data?.[0]?.price ||
    object.plan ||
    object.price
  );
}

function getStripeMetadata(object = {}, subscriptionObject = {}) {
  return {
    ...(subscriptionObject.metadata || {}),
    ...(object.subscription_details?.metadata || {}),
    ...(object.metadata || {})
  };
}

function normalizeStripeStatus(status) {
  const normalized = String(status || "").toLowerCase();
  const map = {
    active: "active",
    trialing: "trialing",
    canceled: "canceled",
    past_due: "past_due",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "expired",
    paused: "inactive"
  };
  return map[normalized];
}

function statusFromStripeEvent(event, subscriptionObject) {
  const object = event.data.object || {};
  if (event.type === "checkout.session.completed") {
    return normalizeStripeStatus(subscriptionObject?.status) ||
      (object.payment_status === "no_payment_required" ? "trialing" : object.payment_status === "paid" ? "active" : "past_due");
  }
  if (event.type === "customer.subscription.deleted") return "canceled";
  if (event.type === "customer.subscription.paused") return "inactive";
  if (event.type === "customer.subscription.resumed") return normalizeStripeStatus(subscriptionObject?.status) || "active";
  if (event.type === "customer.subscription.trial_will_end") return "trialing";
  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") return "past_due";
  if (event.type === "invoice.paid") return normalizeStripeStatus(subscriptionObject?.status) || "active";
  if (event.type === "charge.refunded") return "refunded";
  return normalizeStripeStatus(object.status) || normalizeStripeStatus(subscriptionObject?.status) || "active";
}

function planNameFromStripe({ metadata, price }) {
  if (metadata.planName) return metadata.planName;
  if (metadata.plan === "monthly" || price?.recurring?.interval === "month") return "Project Baller Monthly";
  if (metadata.plan === "yearly" || price?.recurring?.interval === "year") return "Project Baller Yearly";
  return "Project Baller Plan";
}

async function retrieveStripeSubscription(subscriptionId) {
  if (!stripe || !subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"]
    });
  } catch {
    return null;
  }
}

async function retrieveSubscriptionForStripeEvent(object, subscriptionId) {
  if (object.object === "subscription") return object;
  let resolvedSubscriptionId = subscriptionId;

  if (!resolvedSubscriptionId && object.invoice && stripe) {
    try {
      const invoice = await stripe.invoices.retrieve(getStringId(object.invoice));
      resolvedSubscriptionId = getStripeSubscriptionId(invoice);
    } catch {
      resolvedSubscriptionId = undefined;
    }
  }

  return retrieveStripeSubscription(resolvedSubscriptionId);
}

function eventNameFromStatus(status, fallback) {
  const map = {
    active: fallback || "renewed",
    trialing: "trial_started",
    canceled: "canceled",
    expired: "expired",
    refunded: "refunded",
    past_due: "past_due",
    inactive: "manual_update"
  };
  return map[status] || fallback || "manual_update";
}

function billingNotificationForStripeEvent(event, subscription) {
  const object = event.data.object || {};
  if (event.type === "invoice.paid" && object.billing_reason === "subscription_create") {
    return null;
  }

  const planName = subscription.planName || "ProjectBaller Pro";
  const periodEnd = subscription.currentPeriodEnd
    ? dayjs(subscription.currentPeriodEnd).format("MMM D, YYYY")
    : "";
  const messages = {
    "checkout.session.completed": {
      title: "Subscription activated",
      body: `${planName} is active on your account.${periodEnd ? ` Your current period runs until ${periodEnd}.` : ""}`
    },
    "invoice.paid": {
      title: "Subscription renewed",
      body: `${planName} renewed successfully.${periodEnd ? ` Your next renewal is after ${periodEnd}.` : ""}`
    },
    "invoice.payment_failed": {
      title: "Payment failed",
      body: "We could not process your ProjectBaller Pro payment. Please update your billing details to keep access active."
    },
    "invoice.payment_action_required": {
      title: "Payment action required",
      body: "Stripe needs one more step to complete your ProjectBaller Pro payment."
    },
    "customer.subscription.deleted": {
      title: "Subscription canceled",
      body: periodEnd
        ? `Your ProjectBaller Pro subscription is canceled and remains available until ${periodEnd}.`
        : "Your ProjectBaller Pro subscription has been canceled."
    },
    "customer.subscription.paused": {
      title: "Subscription paused",
      body: "Your ProjectBaller Pro subscription has been paused."
    },
    "customer.subscription.resumed": {
      title: "Subscription resumed",
      body: `${planName} is active again on your account.`
    }
  };

  return messages[event.type] || null;
}

async function notifyStripeBillingEvent(event, subscription) {
  const message = billingNotificationForStripeEvent(event, subscription);
  if (!message || !subscription?.user) return;

  const stripeEventId = event.id || "";
  const alreadySent = stripeEventId
    ? await Notification.exists({
        user: subscription.user,
        type: "billing",
        "data.stripeEventId": stripeEventId
      })
    : null;

  if (alreadySent) return;

  await notifyUser(
    subscription.user,
    "billing",
    message.title,
    message.body,
    {
      provider: "stripe",
      stripeEventId,
      stripeEventType: event.type,
      subscriptionId: subscription._id.toString(),
      externalSubscriptionId: subscription.externalSubscriptionId,
      status: subscription.status,
      planName: subscription.planName,
      currentPeriodEnd: subscription.currentPeriodEnd,
      route: "/(tabs)/more"
    }
  );
}

async function createFreeTrialSubscription(userId, trialDays = 7) {
  const now = new Date();
  const trialEndsAt = dayjs(now).add(trialDays, "day").toDate();
  const existing = await Subscription.findOne({
    user: userId,
    status: { $in: ["trialing", "active"] }
  });

  if (existing) return existing;

  const subscription = await Subscription.create({
    user: userId,
    provider: "manual",
    status: "trialing",
    planId: "free-trial",
    planName: "Project Baller Free Trial",
    trialEndsAt,
    startedAt: now,
    entitlements: ["pro"],
    metadata: {
      source: "registration",
      trialDays
    }
  });

  await trackRevenueEvent({
    user: userId,
    subscription: subscription._id,
    provider: "manual",
    type: "trial_started",
    status: "trialing",
    metadata: { source: "registration", trialDays }
  });

  return subscription;
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
  const object = event.data.object || {};
  const initialSubscriptionId = getStripeSubscriptionId(object);
  const subscriptionObject = await retrieveSubscriptionForStripeEvent(object, initialSubscriptionId);
  const subscriptionId = initialSubscriptionId || subscriptionObject?.id;
  const existing = subscriptionId
    ? await Subscription.findOne({ provider: "stripe", externalSubscriptionId: subscriptionId }).lean()
    : null;
  const metadata = getStripeMetadata(object, subscriptionObject || {});
  const customerEmail = object.customer_email || object.customer_details?.email || object.customer_email || object.receipt_email;
  const metadataUserId = metadata.userId || object.client_reference_id;
  const user = metadataUserId
    ? await User.findById(metadataUserId)
    : existing?.user
      ? await User.findById(existing.user)
      : customerEmail
        ? await User.findOne({ email: customerEmail })
        : null;
  const userId = user?._id || existing?.user;
  const status = statusFromStripeEvent(event, subscriptionObject);
  const price = getStripePrice(object, subscriptionObject || {});
  const linePeriod = object.lines?.data?.[0]?.period || {};
  const currentPeriodEnd = stripeDate(subscriptionObject?.current_period_end || object.current_period_end || linePeriod.end);
  const trialEndsAt = stripeDate(subscriptionObject?.trial_end || object.trial_end);
  const canceledAt = stripeDate(subscriptionObject?.canceled_at || object.canceled_at);
  const amount = centsToAmount(
    object.amount_total ??
    object.amount_paid ??
    object.amount_due ??
    object.amount_refunded ??
    price?.unit_amount
  );
  const currency = (object.currency || price?.currency || "usd").toLowerCase();
  const externalCustomerId = getStripeCustomerId(object, subscriptionObject || {});

  if (!userId && !subscriptionId) return null;

  const updates = compactObject({
    ...(userId ? { user: userId } : {}),
    provider: "stripe",
    status,
    planId: metadata.plan || price?.id || object.plan?.id || subscriptionId,
    planName: planNameFromStripe({ metadata, price }),
    amount,
    currency,
    trialEndsAt,
    currentPeriodEnd,
    startedAt: stripeDate(subscriptionObject?.current_period_start || object.current_period_start || object.created),
    canceledAt: status === "canceled" ? (canceledAt || new Date()) : canceledAt,
    expiredAt: status === "expired" || status === "refunded" ? new Date() : undefined,
    lastRenewedAt: event.type === "invoice.paid" && status === "active" ? new Date() : undefined,
    externalCustomerId,
    externalSubscriptionId: subscriptionId,
    entitlements: ["active", "trialing"].includes(status) ? ["pro"] : [],
    metadata: {
      eventId: event.id,
      eventType: event.type,
      object,
      subscription: subscriptionObject || undefined
    }
  });

  const subscription = await Subscription.findOneAndUpdate(
    subscriptionId
      ? { provider: "stripe", externalSubscriptionId: subscriptionId }
      : { provider: "stripe", user: userId },
    { $set: updates },
    { upsert: Boolean(userId), new: true, setDefaultsOnInsert: true }
  );

  if (subscription) {
    await trackRevenueEvent({
      user: subscription.user,
      subscription: subscription._id,
      provider: "stripe",
      type: event.type === "checkout.session.completed" ? "checkout_completed" : eventNameFromStatus(status, "renewed"),
      amount,
      currency,
      status,
      externalCustomerId,
      externalSubscriptionId: subscriptionId,
      metadata: updates.metadata
    });

    await notifyStripeBillingEvent(event, subscription).catch((error) => {
      console.error("Stripe billing notification failed:", error.message);
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
      status: { $in: ["trialing", "active", "canceled", "past_due"] },
      currentPeriodEnd: { $lt: now }
    },
    { $set: { status: "expired", expiredAt: now } }
  );

  const staleTrials = await Subscription.updateMany(
    {
      status: "trialing",
      trialEndsAt: { $lte: now }
    },
    { $set: { status: "expired", expiredAt: now } }
  );

  return { expired: result.modifiedCount || 0, trials: staleTrials.modifiedCount || 0 };
}

async function sendTrialExpiryReminders() {
  const now = new Date();
  const reminderCutoff = dayjs(now).add(2, "day").toDate();
  const trials = await Subscription.find({
    status: "trialing",
    trialEndsAt: { $gt: now, $lte: reminderCutoff }
  }).select("user trialEndsAt").lean();

  let sent = 0;
  for (const trial of trials) {
    const alreadySent = await Notification.exists({
      user: trial.user,
      type: "trial_expiring",
      "data.subscriptionId": trial._id.toString()
    });
    if (alreadySent) continue;

    const daysLeft = Math.max(1, Math.ceil((new Date(trial.trialEndsAt).getTime() - Date.now()) / 86400000));
    await notifyUser(
      trial.user,
      "trial_expiring",
      "Your free trial ends soon",
      `Your ProjectBaller trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Keep your plan active by continuing with Pro.`,
      {
        subscriptionId: trial._id.toString(),
        trialEndsAt: trial.trialEndsAt,
        route: "/onboarding/undroppable"
      }
    );
    sent += 1;
  }

  return { sent };
}

async function hasActiveEntitlement(userId) {
  const now = new Date();
  const subscription = await Subscription.findOne({
    user: userId,
    $or: [
      {
        status: "active",
        $or: [{ currentPeriodEnd: { $exists: false } }, { currentPeriodEnd: null }, { currentPeriodEnd: { $gte: now } }]
      },
      {
        status: "canceled",
        currentPeriodEnd: { $gte: now }
      },
      {
        status: "trialing",
        trialEndsAt: { $gte: now }
      }
    ]
  }).lean();
  return Boolean(subscription);
}

module.exports = {
  createFreeTrialSubscription,
  hasActiveEntitlement,
  sendTrialExpiryReminders,
  syncExpiredSubscriptions,
  updateManualSubscription,
  upsertRevenueCatSubscription,
  upsertStripeSubscription
};
