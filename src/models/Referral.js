const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    code: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "trial_started", "active", "rewarded"],
      default: "pending"
    },
    rewardXp: {
      type: Number,
      default: 100
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", referralSchema);
