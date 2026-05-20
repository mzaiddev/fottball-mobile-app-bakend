const AdminRule = require("../models/AdminRule");
const RehabProtocol = require("../models/RehabProtocol");
const User = require("../models/User");
const env = require("../config/env");
const defaults = require("../data/defaultSeed");

async function bootstrapDefaults() {
  const ruleCount = await AdminRule.countDocuments();
  if (!ruleCount) {
    await AdminRule.insertMany(defaults.adminRules);
  }

  const rehabCount = await RehabProtocol.countDocuments();
  if (!rehabCount) {
    await RehabProtocol.insertMany(defaults.rehabProtocols);
  }

  if (env.defaultAdmin.email && env.defaultAdmin.password) {
    const email = env.defaultAdmin.email.toLowerCase();
    const existingAdmin = await User.findOne({ email });
    if (!existingAdmin) {
      await User.create({
        fullName: env.defaultAdmin.name || "Project Baller Owner",
        email,
        password: env.defaultAdmin.password,
        role: "owner",
        acceptedTerms: true
      });
    }
  }
}

module.exports = { bootstrapDefaults };
