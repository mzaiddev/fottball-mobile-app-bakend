const { StatusCodes } = require("http-status-codes");
const { OAuth2Client } = require("google-auth-library");
const { v4: uuid } = require("uuid");
const User = require("../models/User");
const Referral = require("../models/Referral");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { signAccessToken, signRefreshToken } = require("../utils/tokens");
const { getRolePermissions } = require("../services/adminRules.service");
const env = require("../config/env");

const googleClient = new OAuth2Client();

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

  const referrer = normalizedReferralCode
    ? await User.findOne({ referralCode: normalizedReferralCode })
    : null;
  if (normalizedReferralCode && !referrer) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Referral code not found");
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

  if (referrer) {
    await Referral.create({
      referrer: referrer._id,
      referredUser: user._id,
      code: normalizedReferralCode
    });
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

  if (!user || !user.password || !(await user.comparePassword(password))) {
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

async function verifyGoogleIdentity(idToken) {
  const audiences = [
    env.googleAuth.webClientId,
    env.googleAuth.iosClientId,
    env.googleAuth.androidClientId
  ].filter(Boolean);

  if (!audiences.length) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Google sign-in is not configured");
  }

  const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified === false) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Google account could not be verified");
  }
  return {
    providerUserId: payload.sub,
    email: payload.email,
    fullName: payload.name
  };
}

async function verifyAppleIdentity(idToken) {
  const audiences = [
    env.appleAuth.clientId,
    env.appleAuth.iosBundleId,
    env.appleAuth.appBundleId
  ].filter(Boolean);

  if (!audiences.length) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Apple sign-in is not configured");
  }

  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: "https://appleid.apple.com",
    audience: audiences
  });

  if (!payload.sub) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Apple account could not be verified");
  }
  return {
    providerUserId: payload.sub,
    email: payload.email,
    fullName: ""
  };
}

async function verifySocialIdentity(provider, idToken) {
  if (provider === "google") return verifyGoogleIdentity(idToken);
  if (provider === "apple") return verifyAppleIdentity(idToken);
  throw new ApiError(StatusCodes.BAD_REQUEST, "Unsupported social provider");
}

const socialAuth = asyncHandler(async (req, res) => {
  const { provider, idToken, fullName, referralCodeEntered } = req.body;
  const normalizedReferralCode = referralCodeEntered?.trim().toUpperCase();
  const identity = await verifySocialIdentity(provider, idToken);
  const providerPath = {
    $elemMatch: {
      provider,
      providerUserId: identity.providerUserId
    }
  };

  let user = await User.findOne({ authProviders: providerPath });
  if (!user && identity.email) {
    user = await User.findOne({ email: identity.email });
  }

  let isNewUser = false;
  if (!user) {
    if (!identity.email) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Email is required the first time you use this sign-in method");
    }
    const referrer = normalizedReferralCode
      ? await User.findOne({ referralCode: normalizedReferralCode })
      : null;
    if (normalizedReferralCode && !referrer) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Referral code not found");
    }

    user = await User.create({
      fullName: fullName || identity.fullName || identity.email.split("@")[0],
      email: identity.email,
      acceptedTerms: true,
      referralCode: `BALLER-${uuid().slice(0, 8).toUpperCase()}`,
      authProviders: [{ provider, providerUserId: identity.providerUserId, email: identity.email }],
      onboarding: {
        referralCodeEntered: normalizedReferralCode
      }
    });
    isNewUser = true;

    if (referrer) {
      await Referral.create({
        referrer: referrer._id,
        referredUser: user._id,
        code: normalizedReferralCode
      });
    }
  } else {
    const hasProvider = (user.authProviders || []).some(
      (item) => item.provider === provider && item.providerUserId === identity.providerUserId
    );
    if (!hasProvider) {
      user.authProviders.push({ provider, providerUserId: identity.providerUserId, email: identity.email });
    }
    user.lastActiveAt = new Date();
    await user.save();
  }

  res.json(
    new ApiResponse(isNewUser ? "Account created" : "Login successful", {
      user: withPermissions(user),
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      isNewUser
    })
  );
});

const me = asyncHandler(async (req, res) => {
  res.json(new ApiResponse("Current user", withPermissions(req.user)));
});

const validateReferralCode = asyncHandler(async (req, res) => {
  const code = (req.body.code || req.params.code)?.trim().toUpperCase();
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

module.exports = { register, login, socialAuth, me, validateReferralCode };
