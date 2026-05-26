const Notification = require("../models/Notification");
const PushToken = require("../models/PushToken");

const EXPO_CHUNK_SIZE = 100;
const EXPO_CHANNEL_ID = "projectballer-reminders";

async function deliverExpoPush(tokens, notification) {
  if (!tokens.length || typeof fetch !== "function") {
    return { status: "skipped", tickets: [], error: tokens.length ? "Fetch API unavailable" : "No active push tokens" };
  }

  const messages = tokens.map((pushToken) => ({
    to: pushToken.token,
    sound: "default",
    priority: "high",
    channelId: EXPO_CHANNEL_ID,
    title: notification.title,
    body: notification.body,
    data: {
      notificationId: notification._id.toString(),
      type: notification.type,
      ...(notification.data || {})
    },
    badge: 1
  }));

  try {
    const tickets = [];
    const invalidTokens = [];

    for (let index = 0; index < messages.length; index += EXPO_CHUNK_SIZE) {
      const chunk = messages.slice(index, index + EXPO_CHUNK_SIZE);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(chunk)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { status: "failed", tickets: payload?.data || [], error: payload?.errors?.[0]?.message || "Expo push failed" };
      }

      const chunkTickets = payload?.data || [];
      tickets.push(...chunkTickets);
      chunkTickets.forEach((ticket, ticketIndex) => {
        if (ticket?.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(tokens[index + ticketIndex].token);
        }
      });
    }

    if (invalidTokens.length) {
      await PushToken.updateMany(
        { token: { $in: invalidTokens } },
        { $set: { isActive: false } }
      );
    }

    return { status: "sent", tickets, error: "" };
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
