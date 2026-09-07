const initializeRadarSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`Radar client connected: ${socket.id}`);

    socket.emit("radar:connected", {
      message: "Connected to PRJ-17 Radar System",
    });

    socket.on("disconnect", () => {
      console.log(`Radar client disconnected: ${socket.id}`);
    });
  });
};

module.exports = initializeRadarSocket;