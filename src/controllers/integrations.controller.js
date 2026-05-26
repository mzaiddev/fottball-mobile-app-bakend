const crypto = require("crypto");
const multer = require("multer");
const { StatusCodes } = require("http-status-codes");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { cloudinary } = require("../config/cloudinary");
const env = require("../config/env");
const { createBillingPortalSession, createCheckoutSession, stripe } = require("../services/payment.service");
const { upsertRevenueCatSubscription, upsertStripeSubscription } = require("../services/billing.service");

const upload = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(fileBuffer, originalName, mimeType) {
  return new Promise((resolve, reject) => {
    const publicId = `${Date.now()}-${originalName.replace(/\s+/g, "-")}`;
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "project-baller",
        public_id: publicId,
        resource_type: mimeType?.startsWith("video/") ? "video" : "auto"
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
}

const createSubscriptionCheckout = asyncHandler(async (req, res) => {
  const session = await createCheckoutSession({
    customerEmail: req.user.email,
    userId: req.user._id.toString(),
    plan: req.body.plan || "yearly",
    successUrl: req.body.successUrl || `${env.clientUrl}/billing/success`,
    cancelUrl: req.body.cancelUrl || `${env.clientUrl}/billing/cancel`
  });

  res.json(new ApiResponse("Checkout session created", session));
});

const createSubscriptionPortal = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({
    user: req.user._id,
    provider: "stripe",
    externalCustomerId: { $exists: true, $ne: null }
  }).sort({ updatedAt: -1 });

  if (!subscription) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "No Stripe subscription is available to manage");
  }

  const session = await createBillingPortalSession({
    customerId: subscription.externalCustomerId,
    returnUrl: req.body.returnUrl || env.clientUrl || env.appBaseUrl
  });

  res.json(new ApiResponse("Billing portal session created", session));
});

const stripeWebhook = asyncHandler(async (req, res) => {
  if (!stripe || !env.stripeWebhookSecret) {
    return res.json({ received: true, mocked: true });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Missing Stripe signature");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (error) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid Stripe webhook signature: ${error.message}`);
  }

  if ([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.paid",
    "invoice.payment_action_required",
    "invoice.payment_failed",
    "charge.refunded"
  ].includes(event.type)) {
    await upsertStripeSubscription(event);
  }

  res.json({ received: true });
});

const revenueCatWebhook = asyncHandler(async (req, res) => {
  const expected = env.revenueCatWebhookSecret;
  const signature = req.headers["x-revenuecat-signature"];
  if (expected && signature !== expected) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid RevenueCat signature");
  }

  const event = req.body?.event || {};
  const appUserId = event.app_user_id;
  if (appUserId) {
    const user = await User.findById(appUserId);
    if (user) {
      await upsertRevenueCatSubscription(event);
    }
  }

  res.json({ received: true });
});

const cloudinaryUploadResult = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "No file uploaded");
  }

  const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, req.file.mimetype);
  res.status(StatusCodes.CREATED).json(
    new ApiResponse("File uploaded", {
      url: result.secure_url,
      filename: result.public_id
    })
  );
});

const createReferralShareLink = asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(6).toString("hex");
  res.json(
    new ApiResponse("Referral share link", {
      url: `${env.clientUrl}/ref/${req.user.referralCode}?nonce=${token}`
    })
  );
});

module.exports = {
  upload,
  createSubscriptionCheckout,
  createSubscriptionPortal,
  stripeWebhook,
  revenueCatWebhook,
  cloudinaryUploadResult,
  createReferralShareLink
};
