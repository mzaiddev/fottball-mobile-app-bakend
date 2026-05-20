const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    content: String,
    mediaUrls: [String],
    createdAt: {
      type: Date,
      default: Date.now
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { _id: false }
);

const messageThreadSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    messages: [messageSchema],
    lastMessageAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("MessageThread", messageThreadSchema);
