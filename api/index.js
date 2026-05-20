let app;

function loadApp() {
  if (!app) {
    app = require("../src/app");
  }
  return app;
}

module.exports = async function handler(req, res) {
  try {
    return loadApp()(req, res);
  } catch (error) {
    console.error("Vercel function boot failed", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Backend failed to start. Check Vercel environment variables and function logs."
        : error.message;
    return res.status(500).json({
      success: false,
      message,
      details: process.env.NODE_ENV === "production" ? null : error.stack
    });
  }
};
