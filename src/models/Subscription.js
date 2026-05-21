const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    provider: {
      type: String,
      enum: ["revenuecat", "stripe", "manual"],
      default: "revenuecat"
    },
    planId: String,
    planName: String,
    status: {
      type: String,
      enum: ["trialing", "active", "canceled", "past_due", "inactive", "expired", "refunded"],
      default: "inactive"
    },
    amount: Number,
    currency: {
      type: String,
      default: "usd"
    },
    trialEndsAt: Date,
    currentPeriodEnd: Date,
    startedAt: Date,
    canceledAt: Date,
    expiredAt: Date,
    lastRenewedAt: Date,
    externalCustomerId: String,
    externalSubscriptionId: String,
    entitlements: [String],
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
