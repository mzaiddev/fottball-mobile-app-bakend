const Stripe = require("stripe");
const env = require("../config/env");

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

async function createCheckoutSession({ customerEmail, priceId, successUrl, cancelUrl, trialDays = 7 }) {
  if (!stripe) {
    return {
      mocked: true,
      url: `${env.appBaseUrl}/mock-checkout`
    };
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  return session;
}

module.exports = { stripe, createCheckoutSession };
