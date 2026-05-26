const Stripe = require("stripe");
const env = require("../config/env");

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

const PRICE_IDS = {
  yearly: env.stripeYearlyPriceId,
  monthly: env.stripeMonthlyPriceId
};

async function createCheckoutSession({ customerEmail, userId, plan = "yearly", priceId, successUrl, cancelUrl, trialDays = 0 }) {
  const resolvedPriceId = priceId || PRICE_IDS[plan];
  if (!stripe) {
    return {
      mocked: true,
      url: successUrl || `${env.appBaseUrl}/mock-checkout`
    };
  }
  if (!resolvedPriceId) {
    throw new Error(`Stripe price id is not configured for the ${plan} plan`);
  }

  const subscriptionData = {
    metadata: {
      userId,
      priceId: resolvedPriceId,
      plan,
      planName: plan === "monthly" ? "Project Baller Monthly" : "Project Baller Yearly"
    }
  };

  if (trialDays > 0) {
    subscriptionData.trial_period_days = trialDays;
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    client_reference_id: userId,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{ price: resolvedPriceId, quantity: 1 }],
    metadata: {
      userId,
      priceId: resolvedPriceId,
      plan,
      planName: plan === "monthly" ? "Project Baller Monthly" : "Project Baller Yearly"
    },
    subscription_data: subscriptionData,
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  return session;
}

async function createBillingPortalSession({ customerId, returnUrl }) {
  if (!stripe) {
    return {
      mocked: true,
      url: returnUrl || env.clientUrl || env.appBaseUrl
    };
  }

  if (!customerId) {
    throw new Error("Stripe customer id is required");
  }

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || env.clientUrl || env.appBaseUrl
  });
}

module.exports = { stripe, createBillingPortalSession, createCheckoutSession };
