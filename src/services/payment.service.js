const Stripe = require("stripe");
const env = require("../config/env");

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

const SUBSCRIPTION_PLANS = {
  monthly: {
    amount: 999,
    currency: "usd",
    interval: "month",
    name: "Project Baller Monthly",
    description: "ProjectBaller Pro monthly subscription"
  },
  yearly: {
    amount: 9900,
    currency: "usd",
    interval: "year",
    name: "Project Baller Yearly",
    description: "ProjectBaller Pro yearly subscription"
  }
};

function getPlanConfig(plan) {
  return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.yearly;
}

async function createCheckoutSession({ customerEmail, userId, plan = "yearly", successUrl, cancelUrl, trialDays = 0 }) {
  const planConfig = getPlanConfig(plan);
  if (!stripe) {
    return {
      mocked: true,
      url: successUrl || `${env.appBaseUrl}/mock-checkout`
    };
  }

  const subscriptionData = {
    metadata: {
      userId,
      plan,
      planName: planConfig.name
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
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: planConfig.currency,
          unit_amount: planConfig.amount,
          product_data: {
            name: planConfig.name,
            description: planConfig.description,
            metadata: {
              plan
            }
          },
          recurring: {
            interval: planConfig.interval
          }
        }
      }
    ],
    metadata: {
      userId,
      plan,
      planName: planConfig.name
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
