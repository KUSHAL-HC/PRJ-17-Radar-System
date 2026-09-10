const {
  startReplay,
  stopReplay,
  getReplayStatus,
} = require("../services/radarReplayService");

const initializeRadarSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`Radar client connected: ${socket.id}`);

    socket.emit("radar:connected", {
      message: "Connected to PRJ-17 Radar System",
    });

    socket.emit("radar:status", getReplayStatus());

    socket.on("radar:start", async () => {
      try {
        const result = await startReplay(io, 250);

        socket.emit("radar:status", getReplayStatus());

        if (!result.started) {
          socket.emit("radar:error", {
            message: result.message,
          });
        }
      } catch (error) {
        console.error("Radar start error:", error.message);

        socket.emit("radar:error", {
          message: error.message,
        });
      }
    });

    socket.on("radar:stop", () => {
      stopReplay();

      io.emit("radar:status", getReplayStatus());
    });

    socket.on("disconnect", () => {
      console.log(`Radar client disconnected: ${socket.id}`);
    });
  });
};

module.exports = initializeRadarSocket;
