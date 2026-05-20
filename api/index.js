const app = require("../src/app");
const { connectDb } = require("../src/config/db");
const { bootstrapDefaults } = require("../src/services/bootstrap.service");

let bootPromise;

async function boot() {
  if (!bootPromise) {
    bootPromise = connectDb().then(() => bootstrapDefaults());
  }
  return bootPromise;
}

module.exports = async function handler(req, res) {
  await boot();
  return app(req, res);
};
