const mongoose = require("mongoose");
const env = require("./env");

async function connectDb() {
  console.log(env.mongodbUri, "connecting to MongoDB...");
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(env.mongodbUri, {
      dbName: env.mongodbDbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5,
      retryWrites: true,
      w: "majority",
    });
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (error) {
    console.error("MongoDB connection failed");
    console.error(error.message);
    throw error;
  }
}

module.exports = { connectDb };
