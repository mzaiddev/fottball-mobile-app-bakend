const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const communityPostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    text: {
      type: String,
      default: ""
    },
    mediaUrls: [String],
    programGroup: String,
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommunityPost", communityPostSchema);
