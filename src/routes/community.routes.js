const router = require("express").Router();
const multer = require("multer");
const controller = require("../controllers/community.controller");
const { protect } = require("../middlewares/auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.use(protect);
router.post("/media", upload.single("file"), controller.uploadMedia);
router.post("/posts", controller.createPost);
router.get("/posts", controller.listPosts);
router.post("/posts/:id/like", controller.likePost);
router.post("/posts/:id/comment", controller.commentOnPost);
router.post("/threads", controller.upsertThread);
router.get("/threads", controller.listThreads);
router.post("/threads/:id/messages", controller.sendMessage);

module.exports = router;
