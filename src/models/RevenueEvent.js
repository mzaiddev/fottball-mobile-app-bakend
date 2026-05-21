const mongoose = require("mongoose");

const revenueEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription"
    },
    provider: {
      type: String,
      enum: ["revenuecat", "stripe", "manual"]
    },
    type: {
      type: String,
      enum: [
        "checkout_completed",
        "trial_started",
        "trial_converted",
        "renewed",
        "canceled",
        "past_due",
        "refunded",
        "expired",
        "manual_update"
      ],
      required: true
    },
    amount: Number,
    currency: {
      type: String,
      default: "usd"
    },
    status: String,
    externalCustomerId: String,
    externalSubscriptionId: String,
    metadata: mongoose.Schema.Types.Mixed,
    occurredAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

revenueEventSchema.index({ occurredAt: -1, type: 1 });
revenueEventSchema.index({ user: 1, occurredAt: -1 });

module.exports = mongoose.model("RevenueEvent", revenueEventSchema);
