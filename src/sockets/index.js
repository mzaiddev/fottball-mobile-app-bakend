const { Server } = require("socket.io");

function initializeSocket(server, allowedOrigin) {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigin,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-user-room", (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
      }
    });

    socket.on("disconnect", () => {});
  });

  return io;
}

module.exports = { initializeSocket };
