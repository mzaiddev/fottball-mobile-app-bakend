const Notification = require("../models/Notification");

async function notifyUser(userId, type, title, body, data = {}) {
  return Notification.create({
    user: userId,
    type,
    title,
    body,
    data,
    sentAt: new Date()
  });
}

module.exports = { notifyUser };
