require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const initializeRadarSocket = require("./sockets/radarSocket");

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  initializeRadarSocket(io);

  httpServer.listen(PORT, () => {
    console.log(`PRJ-17 Radar Backend running on port ${PORT}`);
  });
};

startServer();