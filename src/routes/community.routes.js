const router = require("express").Router();
const multer = require("multer");
const controller = require("../controllers/community.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validateBody } = require("../middlewares/validate");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.use(protect);
router.post("/media", upload.single("file"), controller.uploadMedia);
router.post("/posts", validateBody({
  text: { type: "string", max: 3000 },
  mediaUrls: { type: "array", max: 6 },
  programGroup: { type: "string", max: 80 }
}), controller.createPost);
router.get("/posts", controller.listPosts);
router.post("/posts/:id/like", controller.likePost);
router.post("/posts/:id/comment", validateBody({
  text: { type: "string", required: true, min: 1, max: 1000 },
  parentCommentId: { type: "string", max: 80 }
}), controller.commentOnPost);
router.post("/threads", validateBody({
  otherUserId: { type: "string", required: true, max: 80 }
}), controller.upsertThread);
router.get("/threads", controller.listThreads);
router.post("/threads/:id/messages", validateBody({
  content: { type: "string", required: true, min: 1, max: 3000 },
  mediaUrls: { type: "array", max: 6 }
}), controller.sendMessage);

module.exports = router;
