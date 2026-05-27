const dotenv = require("dotenv");

dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET"];

if (process.env.NODE_ENV === "production") {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not configured. AI features will use safe fallback responses.");
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "*",
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/project-baller",
  mongodbDbName: process.env.MONGODB_DB_NAME || "project-baller",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  openAiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
  openAiMaxRetries: Number(process.env.OPENAI_MAX_RETRIES || 2),
  googleAuth: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || "",
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || "",
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || ""
  },
  appleAuth: {
    clientId: process.env.APPLE_CLIENT_ID || "",
    iosBundleId: process.env.IOS_BUNDLE_ID || "",
    appBundleId: process.env.APP_BUNDLE_ID || ""
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || ""
  },
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  revenueCatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5000",
  appScheme: process.env.APP_SCHEME || "projectballer",
  defaultAdmin: {
    name: process.env.DEFAULT_ADMIN_NAME || "",
    email: process.env.DEFAULT_ADMIN_EMAIL || "",
    password: process.env.DEFAULT_ADMIN_PASSWORD || ""
  }
};
