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

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function requestBaseUrl(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.get("host");
  if (!host) return env.appBaseUrl;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol || "https";
  return `${proto}://${host}`;
}

function absoluteBackendUrl(req, path) {
  return new URL(path, requestBaseUrl(req)).toString();
}

function checkoutRedirectUrl(req, status) {
  const url = new URL("/api/integrations/checkout/redirect", requestBaseUrl(req));
  url.searchParams.set("status", status);
  if (status === "success") {
    url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  }
  return url.toString();
}

function appDeepLinkForStatus(status) {
  const pathByStatus = {
    success: "/finalizing?checkout=success",
    cancel: "/billing/plans?checkout=cancel",
    portal: "/more"
  };
  const path = pathByStatus[status] || "/more";
  return `${env.appScheme}://${path.replace(/^\//, "")}`;
}

function redirectHtml({ status, appUrl }) {
  const title = status === "success"
    ? "Payment complete"
    : status === "cancel"
      ? "Checkout canceled"
      : "Returning to ProjectBaller";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;background:#0A0E1A;color:#fff;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}
    .box{max-width:420px}
    a{display:inline-block;margin-top:18px;background:#e11d48;color:#fff;text-decoration:none;padding:14px 18px;border-radius:999px;font-weight:800}
    p{color:#aab2c5;line-height:1.5}
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>You can return to ProjectBaller now. If the app does not open automatically, tap the button below.</p>
    <a href="${appUrl}">Open ProjectBaller</a>
  </div>
  <script>
    setTimeout(function(){ window.location.href = ${JSON.stringify(appUrl)}; }, 350);
  </script>
</body>
</html>`;
}

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
  const successUrl = isHttpUrl(req.body.successUrl)
    ? req.body.successUrl
    : checkoutRedirectUrl(req, "success");
  const cancelUrl = isHttpUrl(req.body.cancelUrl)
    ? req.body.cancelUrl
    : checkoutRedirectUrl(req, "cancel");
  const session = await createCheckoutSession({
    customerEmail: req.user.email,
    userId: req.user._id.toString(),
    plan: req.body.plan || "yearly",
    successUrl,
    cancelUrl
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
    returnUrl: isHttpUrl(req.body.returnUrl)
      ? req.body.returnUrl
      : absoluteBackendUrl(req, "/api/integrations/checkout/redirect?status=portal")
  });

  res.json(new ApiResponse("Billing portal session created", session));
});

const checkoutRedirect = asyncHandler(async (req, res) => {
  const status = ["success", "cancel", "portal"].includes(String(req.query.status))
    ? String(req.query.status)
    : "portal";
  const appUrl = appDeepLinkForStatus(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(redirectHtml({ status, appUrl }));
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
  checkoutRedirect,
  stripeWebhook,
  revenueCatWebhook,
  cloudinaryUploadResult,
  createReferralShareLink
};
