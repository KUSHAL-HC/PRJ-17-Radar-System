const express = require("express");
const cors = require("cors");

const mlRoutes = require("./routes/mlRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "PRJ-17 Radar Backend is running",
  });
});

// ML prediction routes
app.use("/api/ml", mlRoutes);

module.exports = app;