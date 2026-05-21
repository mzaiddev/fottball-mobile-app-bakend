const mongoose = require("mongoose");

const pushTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    token: {
      type: String,
      required: true,
      unique: true
    },
    provider: {
      type: String,
      enum: ["expo", "fcm", "apns"],
      default: "expo"
    },
    platform: String,
    deviceId: String,
    isActive: {
      type: Boolean,
      default: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

pushTokenSchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model("PushToken", pushTokenSchema);
