const mongoose = require("mongoose");
const env = require("./env");

const globalCache = global.__projectBallerMongo || {
  connection: null,
  promise: null,
  bootstrapPromise: null
};

global.__projectBallerMongo = globalCache;

async function connectDb() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (globalCache.connection) {
    return globalCache.connection;
  }
  if (globalCache.promise) {
    return globalCache.promise;
  }

  console.log("Connecting to MongoDB...");
  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);

  globalCache.promise = mongoose
    .connect(env.mongodbUri, {
      dbName: env.mongodbDbName,
      serverSelectionTimeoutMS: 7000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 0,
      retryWrites: true,
      w: "majority"
    })
    .then((connection) => {
      globalCache.connection = connection.connection;
      console.log(`MongoDB connected: ${mongoose.connection.name}`);
      return globalCache.connection;
    })
    .catch((error) => {
      globalCache.promise = null;
      globalCache.connection = null;
      console.error("MongoDB connection failed");
      console.error(error.message);
      throw error;
    });

  return globalCache.promise;
}

async function bootstrapOnce() {
  if (!globalCache.bootstrapPromise) {
    const { bootstrapDefaults } = require("../services/bootstrap.service");
    globalCache.bootstrapPromise = bootstrapDefaults().catch((error) => {
      globalCache.bootstrapPromise = null;
      throw error;
    });
  }
  return globalCache.bootstrapPromise;
}

function ensureDbConnected(req, res, next) {
  connectDb()
    .then(() => bootstrapOnce())
    .then(() => next())
    .catch(next);
}

module.exports = { connectDb, ensureDbConnected };
