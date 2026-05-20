const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: String,
    title: String,
    body: String,
    data: mongoose.Schema.Types.Mixed,
    isRead: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
