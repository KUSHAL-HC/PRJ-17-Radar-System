const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const { predictUAV } = require("./mlService");

const DATASET_PATH = path.resolve(
  __dirname,
  "../../../set8_tracks_491_919_validated.csv"
);

const REQUIRED_FIELDS = [
  "timestamp",
  "track_id",
  "range_m",
  "azimuth_deg",
  "elevation_deg",
  "rcs_dbsm",
  "radial_velocity_mps",
  "velocity_n_mps",
  "velocity_e_mps",
  "velocity_d_mps",
];

let radarRows = [];
let replayTimer = null;
let currentIndex = 0;
let isRunning = false;

const loadRadarData = () => {
  return new Promise((resolve, reject) => {
    const rows = [];

    if (!fs.existsSync(DATASET_PATH)) {
      return reject(
        new Error(`Radar dataset not found: ${DATASET_PATH}`)
      );
    }

    fs.createReadStream(DATASET_PATH)
      .pipe(csv())
      .on("headers", (headers) => {
        const missing = REQUIRED_FIELDS.filter(
          (field) => !headers.includes(field)
        );

        if (missing.length > 0) {
          reject(
            new Error(
              `Radar dataset is missing required fields: ${missing.join(", ")}`
            )
          );
        }
      })
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", () => {
        radarRows = rows;
        console.log(`Radar dataset loaded: ${rows.length} observations`);
        resolve(rows);
      })
      .on("error", reject);
  });
};

const buildRadarObservation = (row) => ({
  timestamp: row.timestamp,
  track_id: Number(row.track_id),
  range_m: Number(row.range_m),
  azimuth_deg: Number(row.azimuth_deg),
  elevation_deg: Number(row.elevation_deg),
  rcs_dbsm: Number(row.rcs_dbsm),
  radial_velocity_mps: Number(row.radial_velocity_mps),
  velocity_n_mps: Number(row.velocity_n_mps),
  velocity_e_mps: Number(row.velocity_e_mps),
  velocity_d_mps: Number(row.velocity_d_mps),
});

const startReplay = async (io, intervalMs = 250) => {
  if (isRunning) {
    return {
      started: false,
      message: "Radar replay is already running",
    };
  }

  if (radarRows.length === 0) {
    await loadRadarData();
  }

  currentIndex = 0;
  isRunning = true;

  console.log("Radar replay started");

  replayTimer = setInterval(async () => {
    if (currentIndex >= radarRows.length) {
      stopReplay();

      io.emit("radar:complete", {
        message: "Radar replay completed",
        total_observations: radarRows.length,
      });

      return;
    }

    const row = radarRows[currentIndex];
    currentIndex += 1;

    try {
      const observation = buildRadarObservation(row);
      const prediction = await predictUAV(observation);

      io.emit("radar:update", {
        ...observation,
        ...prediction,
      });
    } catch (error) {
      console.error(
        `Radar prediction failed at index ${currentIndex - 1}:`,
        error.message
      );

      io.emit("radar:error", {
        message: "Radar prediction failed",
        index: currentIndex - 1,
      });
    }
  }, intervalMs);

  return {
    started: true,
    message: "Radar replay started",
  };
};

const stopReplay = () => {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }

  isRunning = false;
  console.log("Radar replay stopped");
};

const getReplayStatus = () => ({
  running: isRunning,
  current_index: currentIndex,
  total_observations: radarRows.length,
});

module.exports = {
  loadRadarData,
  startReplay,
  stopReplay,
  getReplayStatus,
};
