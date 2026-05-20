const { StatusCodes } = require("http-status-codes");
const CommunityPost = require("../models/CommunityPost");
const MessageThread = require("../models/MessageThread");
const { cloudinary } = require("../config/cloudinary");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

function uploadBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

function populatePost(postId) {
  return CommunityPost.findById(postId)
    .populate("author", "fullName profilePhotoUrl playerTier")
    .populate("comments.user", "fullName profilePhotoUrl playerTier");
}

const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Image file is required");
  }
  if (!req.file.mimetype?.startsWith("image/")) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Only image uploads are supported");
  }
  if (!cloudinary.config().cloud_name) {
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, "Cloudinary is not configured");
  }

  const folder = req.body.folder || "community";
  const result = await uploadBuffer(req.file, `project-baller/${folder}`);
  res.status(StatusCodes.CREATED).json(
    new ApiResponse("Media uploaded", {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type
    })
  );
});

const createPost = asyncHandler(async (req, res) => {
  if (!req.body.text?.trim() && !(req.body.mediaUrls || []).length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Post text or media is required");
  }
  const post = await CommunityPost.create({
    author: req.user._id,
    text: req.body.text || "",
    mediaUrls: req.body.mediaUrls || [],
    programGroup: req.body.programGroup
  });

  res.status(StatusCodes.CREATED).json(new ApiResponse("Post created", await populatePost(post._id)));
});

const listPosts = asyncHandler(async (req, res) => {
  const posts = await CommunityPost.find()
    .populate("author", "fullName profilePhotoUrl playerTier")
    .populate("comments.user", "fullName profilePhotoUrl playerTier")
    .sort({ createdAt: -1 });
  res.json(new ApiResponse("Community feed", posts));
});

const likePost = asyncHandler(async (req, res) => {
  const post = await CommunityPost.findById(req.params.id);
  if (!post) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Post not found");
  }
  const userId = req.user._id.toString();
  const alreadyLiked = post.likes.some((id) => id.toString() === userId);

  post.likes = alreadyLiked ? post.likes.filter((id) => id.toString() !== userId) : [...post.likes, req.user._id];
  await post.save();

  res.json(new ApiResponse("Post updated", await populatePost(post._id)));
});

const commentOnPost = asyncHandler(async (req, res) => {
  const post = await CommunityPost.findById(req.params.id);
  if (!post) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Post not found");
  }
  if (!req.body.text?.trim()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Comment text is required");
  }

  const parentCommentId = req.body.parentCommentId;
  if (parentCommentId) {
    const parentExists = post.comments.some((comment) => comment._id?.toString() === parentCommentId);
    if (!parentExists) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Parent comment not found");
    }
  }

  post.comments.push({
    user: req.user._id,
    parentComment: parentCommentId || undefined,
    text: req.body.text.trim()
  });
  await post.save();
  res.json(new ApiResponse("Comment added", await populatePost(post._id)));
});

const upsertThread = asyncHandler(async (req, res) => {
  const participantIds = [req.user._id, req.body.otherUserId];
  let thread = await MessageThread.findOne({ participants: { $all: participantIds, $size: 2 } });
  if (!thread) {
    thread = await MessageThread.create({ participants: participantIds, messages: [] });
  }
  res.json(new ApiResponse("Thread ready", thread));
});

const sendMessage = asyncHandler(async (req, res) => {
  const thread = await MessageThread.findById(req.params.id);
  thread.messages.push({
    sender: req.user._id,
    content: req.body.content,
    mediaUrls: req.body.mediaUrls || [],
    readBy: [req.user._id]
  });
  thread.lastMessageAt = new Date();
  await thread.save();
  res.status(StatusCodes.CREATED).json(new ApiResponse("Message sent", thread));
});

const listThreads = asyncHandler(async (req, res) => {
  const threads = await MessageThread.find({ participants: req.user._id }).populate("participants", "fullName profilePhotoUrl");
  res.json(new ApiResponse("Threads", threads));
});

module.exports = { uploadMedia, createPost, listPosts, likePost, commentOnPost, upsertThread, sendMessage, listThreads };
