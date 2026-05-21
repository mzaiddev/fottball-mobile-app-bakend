const Notification = require("../models/Notification");
const PushToken = require("../models/PushToken");

async function deliverExpoPush(tokens, notification) {
  if (!tokens.length || typeof fetch !== "function") {
    return { status: "skipped", tickets: [], error: tokens.length ? "Fetch API unavailable" : "No active push tokens" };
  }

  const messages = tokens.map((token) => ({
    to: token.token,
    sound: "default",
    title: notification.title,
    body: notification.body,
    data: notification.data || {}
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: "failed", tickets: payload?.data || [], error: payload?.errors?.[0]?.message || "Expo push failed" };
    }
    return { status: "sent", tickets: payload?.data || [], error: "" };
  } catch (error) {
    return { status: "failed", tickets: [], error: error instanceof Error ? error.message : "Push delivery failed" };
  }
}

async function notifyUser(userId, type, title, body, data = {}) {
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    body,
    data,
    sentAt: new Date()
  });

  const tokens = await PushToken.find({ user: userId, isActive: true, provider: "expo" }).lean();
  const delivery = await deliverExpoPush(tokens, notification);
  notification.deliveryStatus = delivery.status;
  notification.pushTickets = delivery.tickets;
  notification.deliveryError = delivery.error;
  if (delivery.status === "sent") notification.deliveredAt = new Date();
  await notification.save();
  return notification;
}

module.exports = { deliverExpoPush, notifyUser };
