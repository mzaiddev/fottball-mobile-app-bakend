const { Server } = require("socket.io");

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*"
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
