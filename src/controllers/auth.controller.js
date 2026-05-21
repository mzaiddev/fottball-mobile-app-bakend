const { StatusCodes } = require("http-status-codes");
const { v4: uuid } = require("uuid");
const User = require("../models/User");
const Referral = require("../models/Referral");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { signAccessToken, signRefreshToken } = require("../utils/tokens");
const { getRolePermissions } = require("../services/adminRules.service");

function withPermissions(user) {
  const plain = user?.toObject ? user.toObject() : user;
  if (plain && plain.role !== "user") {
    plain.permissions = getRolePermissions(plain.role);
  }
  return plain;
}

const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, acceptedTerms, referralCodeEntered } = req.body;
  const normalizedReferralCode = referralCodeEntered?.trim().toUpperCase();

  if (!acceptedTerms) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "You must accept the checkbox before continuing");
  }

  const exists = await User.findOne({ email });
  if (exists) {
    throw new ApiError(StatusCodes.CONFLICT, "Email already registered");
  }

  const user = await User.create({
    fullName,
    email,
    password,
    acceptedTerms,
    referralCode: `BALLER-${uuid().slice(0, 8).toUpperCase()}`,
    onboarding: {
      referralCodeEntered: normalizedReferralCode
    }
  });

  if (normalizedReferralCode) {
    const referrer = await User.findOne({ referralCode: normalizedReferralCode });
    if (referrer) {
      await Referral.create({
        referrer: referrer._id,
        referredUser: user._id,
        code: normalizedReferralCode
      });
    }
  }

  res.status(StatusCodes.CREATED).json(
    new ApiResponse("Account created", {
      user: withPermissions(user),
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user)
    })
  );
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid email or password");
  }

  user.lastActiveAt = new Date();
  await user.save();

  const safeUser = await User.findById(user._id);

  res.json(
    new ApiResponse("Login successful", {
      user: withPermissions(safeUser),
      accessToken: signAccessToken(safeUser),
      refreshToken: signRefreshToken(safeUser)
    })
  );
});

const me = asyncHandler(async (req, res) => {
  res.json(new ApiResponse("Current user", withPermissions(req.user)));
});

const validateReferralCode = asyncHandler(async (req, res) => {
  const code = req.params.code?.trim().toUpperCase();
  if (!code) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Referral code is required");
  }

  const referrer = await User.findOne({ referralCode: code }).select("fullName referralCode");
  if (!referrer) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Referral code not found");
  }

  res.json(new ApiResponse("Referral code verified", {
    code,
    referrerName: referrer.fullName
  }));
});

module.exports = { register, login, me, validateReferralCode };
