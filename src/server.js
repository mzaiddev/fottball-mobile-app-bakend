const http = require("http");
const cron = require("node-cron");
const app = require("./app");
const env = require("./config/env");
const { connectDb } = require("./config/db");
const User = require("./models/User");
const { bootstrapDefaults } = require("./services/bootstrap.service");
const { sendTrialExpiryReminders, syncExpiredSubscriptions } = require("./services/billing.service");
const { calculateReadiness } = require("./services/readiness.service");
const { initializeSocket } = require("./sockets");

async function start() {
  await connectDb();
  await bootstrapDefaults();

  const server = http.createServer(app);
  initializeSocket(server, env.clientUrl);

  cron.schedule("0 4 * * *", async () => {
    const users = await User.find().limit(500);
    for (const user of users) {
      const readiness = await calculateReadiness(user);
      await User.findByIdAndUpdate(user._id, { readiness });
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    await sendTrialExpiryReminders();
    await syncExpiredSubscriptions();
  });

  server.listen(env.port, () => {
    console.log(`Project Baller backend running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
