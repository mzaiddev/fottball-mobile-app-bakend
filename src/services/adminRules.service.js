const AdminRule = require("../models/AdminRule");

const DEFAULT_RULES = {
  maxGym: 5,
  minRecovery: 1,
  maxSession: 90,
  autoDeload: true,
  protein: 1.8,
  hydration: 3,
  carbLoad: 1.3,
  supplements: true,
  regens: 2,
  tokenCap: 500000,
  blockDx: true,
  requireApproval: true
};

const ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: [
    "dashboard",
    "analytics",
    "users",
    "plans",
    "content",
    "rules",
    "subscriptions",
    "gamification",
    "notifications",
    "aiLogs",
    "support",
    "roles"
  ],
  coach: ["dashboard", "analytics", "users", "plans", "content", "gamification", "aiLogs"],
  moderator: ["dashboard", "users", "content", "notifications", "support", "gamification"],
  support: ["dashboard", "users", "support", "notifications"]
};

function parseNumber(value, fallback, { min, max } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizePayload(payload = {}) {
  return {
    maxGym: parseNumber(payload.maxGym, DEFAULT_RULES.maxGym, { min: 0, max: 7 }),
    minRecovery: parseNumber(payload.minRecovery, DEFAULT_RULES.minRecovery, { min: 0, max: 7 }),
    maxSession: parseNumber(payload.maxSession, DEFAULT_RULES.maxSession, { min: 15, max: 180 }),
    autoDeload: parseBoolean(payload.autoDeload, DEFAULT_RULES.autoDeload),
    protein: parseNumber(payload.protein, DEFAULT_RULES.protein, { min: 0.8, max: 3.5 }),
    hydration: parseNumber(payload.hydration, DEFAULT_RULES.hydration, { min: 1, max: 8 }),
    carbLoad: parseNumber(payload.carbLoad, DEFAULT_RULES.carbLoad, { min: 1, max: 3 }),
    supplements: parseBoolean(payload.supplements, DEFAULT_RULES.supplements),
    regens: parseNumber(payload.regens, DEFAULT_RULES.regens, { min: 0, max: 20 }),
    tokenCap: parseNumber(payload.tokenCap, DEFAULT_RULES.tokenCap, { min: 0 }),
    blockDx: parseBoolean(payload.blockDx, DEFAULT_RULES.blockDx),
    requireApproval: parseBoolean(payload.requireApproval, DEFAULT_RULES.requireApproval)
  };
}

async function getAdminRuleSettings() {
  const rule = await AdminRule.findOne({
    isActive: true,
    $or: [{ name: "Admin Panel Rules" }, { category: "general" }]
  })
    .sort({ updatedAt: -1 })
    .lean();

  return normalizePayload(rule?.payload || {});
}

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function hasPermission(role, permission) {
  const permissions = getRolePermissions(role);
  return permissions.includes("*") || permissions.includes(permission);
}

module.exports = {
  DEFAULT_RULES,
  ROLE_PERMISSIONS,
  getAdminRuleSettings,
  getRolePermissions,
  hasPermission
};
