const router = require("express").Router();

router.use("/auth", require("./auth.routes"));
router.use("/users", require("./users.routes"));
router.use("/plans", require("./plans.routes"));
router.use("/nutrition", require("./nutrition.routes"));
router.use("/matches", require("./matches.routes"));
router.use("/community", require("./community.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/integrations", require("./integrations.routes"));
router.use("/cron", require("./cron.routes"));

module.exports = router;
