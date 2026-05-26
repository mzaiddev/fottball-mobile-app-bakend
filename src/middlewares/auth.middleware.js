const jwt = require("jsonwebtoken");
const { StatusCodes } = require("http-status-codes");
const env = require("../config/env");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { hasPermission } = require("../services/adminRules.service");
const { hasActiveEntitlement } = require("../services/billing.service");

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.replace("Bearer ", "") : null;

  if (!token) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Authentication token missing");
  }

  const decoded = jwt.verify(token, env.jwtSecret);
  const user = await User.findById(decoded.sub).select("-password");

  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "User no longer exists");
  }

  req.user = user;
  next();
});

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(StatusCodes.FORBIDDEN, "You are not allowed to perform this action"));
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return next(new ApiError(StatusCodes.FORBIDDEN, "You do not have permission for this admin area"));
    }
    return next();
  };
}

const requireActiveEntitlement = asyncHandler(async (req, res, next) => {
  const entitled = await hasActiveEntitlement(req.user._id);
  if (!entitled) {
    throw new ApiError(StatusCodes.PAYMENT_REQUIRED, "Your free trial has ended. Upgrade to Pro to continue.");
  }
  next();
});

module.exports = { protect, authorize, requirePermission, requireActiveEntitlement };
