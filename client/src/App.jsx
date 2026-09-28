import { useEffect, useMemo , useState } from "react";
import socket from "./services/socket";
import "./App.css";
import Radar3D from "./components/Radar3D";

const MAX_TARGETS = 80;

function getThreatLevel(probability = 0) {
  if (probability >= 0.8) return "HIGH";
  if (probability >= 0.5) return "MEDIUM";
  return "LOW";
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
}

function Sparkline({
  data = [],
  min = null,
  max = null,
  className = "",
}) {
  const width = 300;
  const height = 70;
  const padding = 4;

  if (!data.length) {
    return (
      <div className={`sparkline-empty ${className}`}>
        <span>WAITING FOR TELEMETRY</span>
      </div>
    );
  }

  const numeric = data.map(Number).filter(Number.isFinite);

  if (!numeric.length) {
    return (
      <div className={`sparkline-empty ${className}`}>
        <span>NO VALID DATA</span>
      </div>
    );
  }

  const dataMin =
    min !== null ? min : Math.min(...numeric);

  const dataMax =
    max !== null ? max : Math.max(...numeric);

  const range =
    dataMax - dataMin || 1;

  const points = numeric
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(numeric.length - 1, 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((value - dataMin) / range) *
          (height - padding * 2);

      return `${x},${y}`;
    })
    .join(" ");

  const latest = numeric[numeric.length - 1];

  return (
    <div className={`sparkline ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="18"
          x2={width}
          y2="18"
          className="chart-grid-line"
        />

        <line
          x1="0"
          y1="35"
          x2={width}
          y2="35"
          className="chart-grid-line"
        />

        <line
          x1="0"
          y1="52"
          x2={width}
          y2="52"
          className="chart-grid-line"
        />

        <polyline
          points={points}
          className="chart-line"
        />

        <circle
          cx={points.split(" ").at(-1).split(",")[0]}
          cy={points.split(" ").at(-1).split(",")[1]}
          r="2.8"
          className="chart-point"
        />
      </svg>

      <div className="chart-latest">
        {formatNumber(latest, 2)}
      </div>
    </div>
  );
}

function TelemetryChart({
  data = [],
  min = null,
  max = null,
}) {
  const width = 320;
  const height = 90;
  const padding = 6;

  if (!data.length) {
    return (
      <div className="telemetry-chart-empty">
        <span>WAITING FOR SENSOR DATA</span>
      </div>
    );
  }

  const values = data
    .map(Number)
    .filter(Number.isFinite);

  if (!values.length) {
    return (
      <div className="telemetry-chart-empty">
        <span>NO VALID TELEMETRY</span>
      </div>
    );
  }

  const minimum =
    min !== null ? min : Math.min(...values);

  const maximum =
    max !== null ? max : Math.max(...values);

  const range = maximum - minimum || 1;

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(values.length - 1, 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((value - minimum) / range) *
          (height - padding * 2);

      return `${x},${y}`;
    })
    .join(" ");

  const lastPoint =
    points.split(" ").at(-1).split(",");

  return (
    <div className="telemetry-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="22"
          x2={width}
          y2="22"
          className="chart-grid"
        />

        <line
          x1="0"
          y1="45"
          x2={width}
          y2="45"
          className="chart-grid"
        />

        <line
          x1="0"
          y1="68"
          x2={width}
          y2="68"
          className="chart-grid"
        />

        <polyline
          points={points}
          className="chart-line"
        />

        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="3"
          className="chart-endpoint"
        />
      </svg>
    </div>
  );
}

function TargetLockHUD({ target }) {
  if (!target) {
    return (
      <div className="target-lock-hud target-lock-empty">
        <span>NO TRACK LOCK</span>
      </div>
    );
  }

  const probability =
    Number(target.uav_probability) || 0;

  const range =
    Number(target.range_m) || 0;

  const azimuth =
    Number(target.azimuth_deg) || 0;

  /*
   * Tactical 2D HUD position.
   * This is intentionally an operator overlay rather than
   * attempting to replace the 3D projection.
   */
  const angle =
    ((azimuth - 90) * Math.PI) / 180;

  const radius =
    Math.min(range / 1000, 0.88) * 38;

  const x =
    50 + Math.cos(angle) * radius;

  const y =
    50 + Math.sin(angle) * radius;

  return (
    <div
      className="target-lock-hud"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      <div className="lock-bracket">
        <span className="lock-corner tl" />
        <span className="lock-corner tr" />
        <span className="lock-corner bl" />
        <span className="lock-corner br" />

        <span className="lock-cross horizontal" />
        <span className="lock-cross vertical" />
      </div>

      <div className="lock-label">
        <div className="lock-title">
          <span className="lock-dot" />
          TRACK LOCK
        </div>

        <strong>
          T-{target.track_id}
        </strong>

        <span>
          {target.classification}{" "}
          {(probability * 100).toFixed(1)}%
        </span>

        <span>
          {range.toFixed(1)} M /{" "}
          {azimuth.toFixed(1)}°
        </span>
      </div>
    </div>
  );
}


function App(){
  const [connectionStatus, setConnectionStatus] = useState("Connecting");

  const [replayStatus, setReplayStatus] = useState({
    running: false,
    current_index: 0,
    total_observations: 0,
  });

  const [targets, setTargets] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [sweepAngle, setSweepAngle] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState({
  rcs: [],
  velocity: [],
  probability: [],
});
  useEffect(() => {

    const handleConnect = () => {
      setConnectionStatus("Connected");
    };

    const handleDisconnect = () => {
      setConnectionStatus("Disconnected");
    };

    const handleStatus = (data) => {
      setReplayStatus(data);
    };

    const handleUpdate = (data) => {
  const target = {
    ...data,
    receivedAt: Date.now(),
  };

  setTelemetryHistory((previous) => {
    const limit = 60;

    return {
      rcs: [
        ...previous.rcs,
        Number(data.rcs_dbsm) || 0,
      ].slice(-limit),

      velocity: [
        ...previous.velocity,
        Number(data.radial_velocity_mps) || 0,
      ].slice(-limit),

      probability: [
        ...previous.probability,
        Number(data.uav_probability) || 0,
      ].slice(-limit),
    };
  });

  setTargets((previous) => {
    const next = {
      ...previous,
      [data.track_id]: target,
    };

    const entries = Object.entries(next)
      .sort(
        (a, b) =>
          b[1].receivedAt - a[1].receivedAt
      )
      .slice(0, MAX_TARGETS);

    return Object.fromEntries(entries);
  });

  setSelectedTrack(
    (current) => current ?? data.track_id
  );

  setLastUpdate(Date.now());
};

    const handleComplete = (data) => {
      setReplayStatus({
        running: false,
        current_index: data.total_observations,
        total_observations: data.total_observations,
      });
    };

    const handleError = (data) => {
      console.error("Radar error:", data);
    };

    if (socket.connected) handleConnect();

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("radar:status", handleStatus);
    socket.on("radar:update", handleUpdate);
    socket.on("radar:complete", handleComplete);
    socket.on("radar:error", handleError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("radar:status", handleStatus);
      socket.off("radar:update", handleUpdate);
      socket.off("radar:complete", handleComplete);
      socket.off("radar:error", handleError);
    };
  }, []);

  useEffect(() => {
    let animationFrame;

    const animate = (time) => {
      setSweepAngle((time / 35) % 360);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const targetList = useMemo(
    () =>
      Object.values(targets).sort(
        (a, b) => b.uav_probability - a.uav_probability
      ),
    [targets]
  );

  const selectedTarget =
    selectedTrack !== null ? targets[selectedTrack] : null;

  const uavCount = targetList.filter(
    (target) => target.classification === "UAV"
  ).length;

  const highThreatCount = targetList.filter(
    (target) => getThreatLevel(target.uav_probability) === "HIGH"
  ).length;

  const averageRcs =
    targetList.length > 0
      ? targetList.reduce(
          (sum, target) => sum + Number(target.rcs_dbsm || 0),
          0
        ) / targetList.length
      : 0;

  const averageVelocity =
    targetList.length > 0
      ? targetList.reduce(
          (sum, target) =>
            sum + Number(target.radial_velocity_mps || 0),
          0
        ) / targetList.length
      : 0;

const selectedProbability =
  selectedTarget
    ? Number(selectedTarget.uav_probability) || 0
    : 0;

const selectedRcs =
  selectedTarget
    ? Number(selectedTarget.rcs_dbsm) || 0
    : 0;

const selectedVelocity =
  selectedTarget
    ? Number(
        selectedTarget.radial_velocity_mps
      ) || 0
    : 0;

const mediumThreatCount =
  targetList.filter(
    (target) =>
      getThreatLevel(
        target.uav_probability
      ) === "MEDIUM"
  ).length;

const lowThreatCount =
  targetList.filter(
    (target) =>
      getThreatLevel(
        target.uav_probability
      ) === "LOW"
  ).length;

  const progress =
    replayStatus.total_observations > 0
      ? (replayStatus.current_index /
          replayStatus.total_observations) *
        100
      : 0;

  const startReplay = () => {
    setTargets({});
    setSelectedTrack(null);
    socket.emit("radar:start");
  };

  const stopReplay = () => {
    socket.emit("radar:stop");
  };

  return (
    <div className="command-center">
      {/* =====================================================
          TOP COMMAND BAR
         ===================================================== */}

      <header className="command-header">
        <div className="brand-block">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>

          <div>
            <div className="brand-eyebrow">
              PROJECT 17 / SENSOR FUSION PLATFORM
            </div>

            <h1>PRJ-17 RADAR COMMAND</h1>
          </div>
        </div>

        <div className="header-center">
          <span className="header-label">PRIMARY SENSOR</span>
          <strong>RCS / DOPPLER SURVEILLANCE</strong>
        </div>

        <div className="header-status">
          <div className="system-state">
            <span
              className={`system-light ${
                connectionStatus === "Connected"
                  ? "online"
                  : "offline"
              }`}
            />

            <div>
              <span>SYSTEM LINK</span>
              <strong>{connectionStatus.toUpperCase()}</strong>
            </div>
          </div>

          <div className="header-divider" />

          <div className="system-state">
            <span
              className={`system-light ${
                replayStatus.running ? "online" : "standby"
              }`}
            />

            <div>
              <span>RADAR STREAM</span>
              <strong>
                {replayStatus.running ? "ACTIVE" : "STANDBY"}
              </strong>
            </div>
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN COMMAND GRID
         ===================================================== */}

      <main className="command-grid">
        {/* ===================================================
            LEFT SENSOR PANEL
           =================================================== */}

        <aside className="left-rail">
          <section className="hud-panel sensor-panel">
            <div className="hud-title">
              <span>SENSOR ARRAY</span>
              <strong>01</strong>
            </div>

            <div className="sensor-status">
              <div className="radar-status-icon">
                <div />
              </div>

              <div>
                <span>RADAR STATUS</span>
                <strong>OPERATIONAL</strong>
              </div>
            </div>

            <div className="telemetry-list">
              <div>
                <span>SCAN MODE</span>
                <strong>360° ACTIVE</strong>
              </div>

              <div>
                <span>MAX RANGE</span>
                <strong>1.00 KM</strong>
              </div>

              <div>
                <span>SWEEP ANGLE</span>
                <strong>{Math.round(sweepAngle)}°</strong>
              </div>

              <div>
                <span>TRACK CAPACITY</span>
                <strong>80</strong>
              </div>

              <div>
                <span>ACTIVE TRACKS</span>
                <strong>{targetList.length}</strong>
              </div>
            </div>
          </section>

          <section className="hud-panel control-panel">
            <div className="hud-title">
              <span>MISSION CONTROL</span>
              <strong>CTRL</strong>
            </div>

            <button
              className="command-button start"
              onClick={startReplay}
              disabled={replayStatus.running}
            >
              <span>▶</span>
              START RADAR STREAM
            </button>

            <button
              className="command-button stop"
              onClick={stopReplay}
              disabled={!replayStatus.running}
            >
              <span>■</span>
              STOP STREAM
            </button>

            <div className="dataset-readout">
              <div>
                <span>DATASET REPLAY</span>
                <strong>
                  {replayStatus.current_index} /{" "}
                  {replayStatus.total_observations}
                </strong>
              </div>

              <div className="dataset-progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          </section>

          <section className="hud-panel system-panel">
            <div className="hud-title">
              <span>SYSTEM TELEMETRY</span>
              <strong>SYS</strong>
            </div>

            <div className="system-readout">
              <span>PROCESSOR</span>
              <strong>NOMINAL</strong>
            </div>

            <div className="system-readout">
              <span>ML CLASSIFIER</span>
              <strong>RF / ONLINE</strong>
            </div>

            <div className="system-readout">
              <span>SOCKET LINK</span>
              <strong>{connectionStatus.toUpperCase()}</strong>
            </div>

            <div className="system-readout">
              <span>MODEL VERSION</span>
              <strong>RF v2.0</strong>
            </div>
          </section>
        </aside>

        {/* ===================================================
            CENTRAL RADAR
           =================================================== */}

        <section className="radar-command-panel">
          <div className="radar-topline">
            <div>
              <span>PRIMARY SURVEILLANCE VOLUME</span>
              <strong>3D ACTIVE RADAR SPACE</strong>
            </div>

            <div className="radar-coordinates">
              <span>LAT 12.9716</span>
              <span>LON 77.5946</span>
              <span>ALT 914 M</span>
            </div>
          </div>

          <div className="radar-viewport">
            <Radar3D targets={targetList} selectedTrack={selectedTrack} sweepAngle={sweepAngle} onSelect={setSelectedTrack}/>

            <div className="viewport-corner top-left">
              <span>SCAN</span>
              <strong>{Math.round(sweepAngle)}°</strong>
            </div>

            <div className="viewport-corner top-right">
              <span>RANGE</span>
              <strong>1000 M</strong>
            </div>

            <div className="viewport-corner bottom-left">
              <span>CONTACTS</span>
              <strong>{targetList.length}</strong>
            </div>

            <div className="viewport-corner bottom-right">
              <span>MODE</span>
              <strong>3D / RCS</strong>
            </div>

            <div className="axis-label axis-x">EAST</div>
            <div className="axis-label axis-y">ALTITUDE</div>
            <div className="axis-label axis-z">NORTH</div>

            <div className="radar-crosshair">
              <span />
              <span />
            </div>
            <TargetLockHUD target={selectedTarget} />
          </div>

          <div className="radar-bottom">
            <div>
              <span>UAV CONTACTS</span>
              <strong>{uavCount}</strong>
            </div>

            <div>
              <span>HIGH THREAT</span>
              <strong>{highThreatCount}</strong>
            </div>

            <div>
              <span>AVG RCS</span>
              <strong>{formatNumber(averageRcs, 2)} dBsm</strong>
            </div>

            <div>
              <span>AVG RADIAL VELOCITY</span>
              <strong>{formatNumber(averageVelocity, 2)} m/s</strong>
            </div>
          </div>
        </section>

        {/* ===================================================
            RIGHT TARGET PANEL
           =================================================== */}

        <aside className="right-rail">
          <section className="hud-panel selected-panel">
            <div className="hud-title">
              <span>TRACK IDENTIFICATION</span>
              <strong>
                {selectedTarget
                  ? `T-${selectedTarget.track_id}`
                  : "---"}
              </strong>
            </div>

            {selectedTarget ? (
              <>
                <div
                  className={`target-classification ${
                    selectedTarget.classification === "UAV"
                      ? "uav"
                      : "unknown"
                  }`}
                >
                  <div>
                    <span>CLASSIFICATION</span>
                    <strong>
                      {selectedTarget.classification}
                    </strong>
                  </div>

                  <div className="confidence">
                    <span>CONFIDENCE</span>
                    <strong>
                      {(
                        selectedTarget.uav_probability * 100
                      ).toFixed(1)}
                      %
                    </strong>
                  </div>
                </div>

                <div className="threat-banner">
                  <span>THREAT ASSESSMENT</span>

                  <strong
                    className={`threat-${getThreatLevel(
                      selectedTarget.uav_probability
                    ).toLowerCase()}`}
                  >
                    {getThreatLevel(selectedTarget.uav_probability)}
                  </strong>
                </div>

                <div className="target-metrics">
                  <div>
                    <span>RANGE</span>
                    <strong>
                      {formatNumber(selectedTarget.range_m, 1)}
                      <small> m</small>
                    </strong>
                  </div>

                  <div>
                    <span>RCS</span>
                    <strong>
                      {formatNumber(selectedTarget.rcs_dbsm, 2)}
                      <small> dBsm</small>
                    </strong>
                  </div>

                  <div>
                    <span>AZIMUTH</span>
                    <strong>
                      {formatNumber(
                        selectedTarget.azimuth_deg,
                        2
                      )}
                      <small>°</small>
                    </strong>
                  </div>

                  <div>
                    <span>ELEVATION</span>
                    <strong>
                      {formatNumber(
                        selectedTarget.elevation_deg,
                        2
                      )}
                      <small>°</small>
                    </strong>
                  </div>

                  <div>
                    <span>DOPPLER</span>
                    <strong>
                      {formatNumber(
                        selectedTarget.radial_velocity_mps,
                        2
                      )}
                      <small> m/s</small>
                    </strong>
                  </div>

                  <div>
                    <span>TRACK ID</span>
                    <strong>
                      T-{selectedTarget.track_id}
                    </strong>
                  </div>
                </div>

                <div className="target-vector">
                  <div className="vector-ring">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>

                  <div className="vector-info">
                    <span>TRACK VECTOR</span>
                    <strong>
                      AZ {formatNumber(
                        selectedTarget.azimuth_deg,
                        1
                      )}
                      °
                    </strong>
                    <strong>
                      EL {formatNumber(
                        selectedTarget.elevation_deg,
                        1
                      )}
                      °
                    </strong>
                  </div>
                </div>

                <div className="timestamp">
                  <span>LAST SENSOR OBSERVATION</span>
                  <code>{selectedTarget.timestamp}</code>
                </div>
              </>
            ) : (
              <div className="no-target">
                <div className="no-target-icon">+</div>
                <span>AWAITING TARGET SELECTION</span>
                <small>
                  Select a contact from the radar volume.
                </small>
              </div>
            )}
          </section>

          <section className="hud-panel threat-summary">
            <div className="hud-title">
              <span>THREAT SUMMARY</span>
              <strong>LIVE</strong>
            </div>

            <div className="threat-counts">
              <div>
                <strong>{highThreatCount}</strong>
                <span>HIGH</span>
              </div>

              <div>
                <strong>
                  {
                    targetList.filter(
                      (target) =>
                        getThreatLevel(
                          target.uav_probability
                        ) === "MEDIUM"
                    ).length
                  }
                </strong>
                <span>MEDIUM</span>
              </div>

              <div>
                <strong>
                  {
                    targetList.filter(
                      (target) =>
                        getThreatLevel(
                          target.uav_probability
                        ) === "LOW"
                    ).length
                  }
                </strong>
                <span>LOW</span>
              </div>
            </div>
          </section>
        </aside>
      </main>

      {/* =====================================================
          BOTTOM ANALYTICS
         ===================================================== */}

     {/* =====================================================
    LIVE ANALYTICS
   ===================================================== */}

<section className="analytics-command-panel">

  <div className="analytics-header">
    <div>
      <span>REAL-TIME SENSOR ANALYTICS</span>
      <strong>TELEMETRY / SIGNATURE / CLASSIFICATION</strong>
    </div>

    <div className="analytics-live">
      <span className="pulse-dot" />
      STREAMING
    </div>
  </div>

  <div className="analytics-grid">

    {/* RCS */}

    <article className="analytics-card">
      <div className="analytics-card-header">
        <div>
          <span>RCS SIGNATURE</span>
          <strong>
            {formatNumber(selectedRcs, 2)}
            <small> dBsm</small>
          </strong>
        </div>

        <span className="analytics-code">
          SIG-01
        </span>
      </div>

      <TelemetryChart
        data={telemetryHistory.rcs}
      />

      <div className="analytics-footer">
        <span>LIVE CROSS SECTION</span>
        <strong>
          {selectedTarget
            ? "TRACKED"
            : "STANDBY"}
        </strong>
      </div>
    </article>


    {/* DOPPLER */}

    <article className="analytics-card">
      <div className="analytics-card-header">
        <div>
          <span>DOPPLER / RADIAL VELOCITY</span>
          <strong>
            {formatNumber(
              selectedVelocity,
              2
            )}
            <small> m/s</small>
          </strong>
        </div>

        <span className="analytics-code">
          VEL-02
        </span>
      </div>

      <TelemetryChart
        data={telemetryHistory.velocity}
      />

      <div className="analytics-footer">
        <span>RADIAL COMPONENT</span>
        <strong>
          {selectedVelocity >= 0
            ? "APPROACH"
            : "RECESS"}
        </strong>
      </div>
    </article>


    {/* CLASSIFICATION */}

    <article className="analytics-card classification-card">
      <div className="analytics-card-header">
        <div>
          <span>UAV CLASSIFICATION</span>
          <strong>
            {selectedTarget
              ? selectedTarget.classification
              : "---"}
          </strong>
        </div>

        <span className="analytics-code">
          ML-03
        </span>
      </div>

      <TelemetryChart
        data={telemetryHistory.probability}
        min={0}
        max={1}
      />

      <div className="probability-bars">

        <div className="probability-row">
          <span>UAV</span>

          <div className="probability-track">
            <span
              style={{
                width: `${selectedProbability * 100}%`,
              }}
            />
          </div>

          <strong>
            {formatNumber(
              selectedProbability * 100,
              1
            )}%
          </strong>
        </div>

        <div className="probability-row">
          <span>NON-UAV</span>

          <div className="probability-track">
            <span
              style={{
                width: `${
                  (1 - selectedProbability) * 100
                }%`,
              }}
            />
          </div>

          <strong>
            {formatNumber(
              (1 - selectedProbability) * 100,
              1
            )}%
          </strong>
        </div>

      </div>
    </article>


    {/* THREAT */}

    <article className="analytics-card threat-card">

      <div className="analytics-card-header">
        <div>
          <span>CONTACT THREAT MATRIX</span>
          <strong>
            {targetList.length}
            <small> CONTACTS</small>
          </strong>
        </div>

        <span className="analytics-code">
          THR-04
        </span>
      </div>

      <div className="threat-matrix">

        <div className="threat-matrix-cell high">
          <strong>{highThreatCount}</strong>
          <span>HIGH</span>
        </div>

        <div className="threat-matrix-cell medium">
          <strong>{mediumThreatCount}</strong>
          <span>MEDIUM</span>
        </div>

        <div className="threat-matrix-cell low">
          <strong>{lowThreatCount}</strong>
          <span>LOW</span>
        </div>

      </div>

      <div className="analytics-footer">
        <span>TRACK DATABASE</span>
        <strong>
          {targetList.length} / {MAX_TARGETS}
        </strong>
      </div>

    </article>

  </div>


  {/* ACTIVE TRACK DATABASE */}

  <div className="track-database">

    <div className="bottom-header">
      <div>
        <span>TACTICAL DATA STREAM</span>
        <strong>ACTIVE TRACK DATABASE</strong>
      </div>

      <div className="bottom-status">
        <span className="pulse-dot" />
        LIVE TELEMETRY
      </div>
    </div>

    <div className="track-table-wrap">

      <table className="track-table">

        <thead>
          <tr>
            <th>TRACK</th>
            <th>CLASS</th>
            <th>CONF</th>
            <th>RANGE</th>
            <th>AZIMUTH</th>
            <th>ELEVATION</th>
            <th>RCS</th>
            <th>DOPPLER</th>
            <th>THREAT</th>
          </tr>
        </thead>

        <tbody>

          {targetList
            .slice(0, 8)
            .map((target) => {

              const threat =
                getThreatLevel(
                  target.uav_probability
                );

              return (
                <tr
                  key={target.track_id}
                  className={
                    target.track_id ===
                    selectedTrack
                      ? "selected-row"
                      : ""
                  }
                  onClick={() =>
                    setSelectedTrack(
                      target.track_id
                    )
                  }
                >

                  <td className="track-cell">
                    T-{target.track_id}
                  </td>

                  <td>
                    {target.classification}
                  </td>

                  <td>
                    {(
                      target.uav_probability *
                      100
                    ).toFixed(0)}
                    %
                  </td>

                  <td>
                    {formatNumber(
                      target.range_m,
                      1
                    )} m
                  </td>

                  <td>
                    {formatNumber(
                      target.azimuth_deg,
                      1
                    )}°
                  </td>

                  <td>
                    {formatNumber(
                      target.elevation_deg,
                      1
                    )}°
                  </td>

                  <td>
                    {formatNumber(
                      target.rcs_dbsm,
                      2
                    )}
                  </td>

                  <td>
                    {formatNumber(
                      target.radial_velocity_mps,
                      2
                    )}
                  </td>

                  <td
                    className={`threat-cell threat-${threat.toLowerCase()}`}
                  >
                    {threat}
                  </td>

                </tr>
              );
            })}

        </tbody>

      </table>

      {targetList.length === 0 && (
        <div className="table-empty">
          NO ACTIVE CONTACTS — RADAR SYSTEM
          AWAITING SENSOR DATA
        </div>
      )}

    </div>

  </div>

</section>

      {/* =====================================================
          FOOTER
         ===================================================== */}

      <footer className="command-footer">
        <span>PRJ-17 / REAL-TIME RADAR CROSS SECTION ESTIMATOR</span>

        <span>
          MODEL RF UAV CLASSIFIER v2.0
        </span>

        <span>
          {lastUpdate
            ? `LAST UPDATE ${new Date(
                lastUpdate
              ).toLocaleTimeString()}`
            : "NO SENSOR UPDATE"}
        </span>

        <span>
          DATA {replayStatus.current_index}/
          {replayStatus.total_observations}
        </span>
      </footer>
    </div>
  );
}

export default App;