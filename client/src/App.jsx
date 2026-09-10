import { useEffect, useMemo, useState } from "react";
import socket from "./services/socket";
import "./App.css";

const MAX_RANGE = 1000;
const MAX_TARGETS = 80;

function polarToCartesian(range, angleDeg, radius) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  const r = Math.min(Math.max(range / MAX_RANGE, 0), 1) * radius;

  return {
    x: radius + r * Math.cos(angle),
    y: radius + r * Math.sin(angle),
  };
}

function getThreatLevel(probability) {
  if (probability >= 0.8) return "HIGH";
  if (probability >= 0.5) return "MEDIUM";
  return "LOW";
}

function App() {
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

      setTargets((previous) => {
        const next = {
          ...previous,
          [data.track_id]: target,
        };

        const entries = Object.entries(next)
          .sort((a, b) => b[1].receivedAt - a[1].receivedAt)
          .slice(0, MAX_TARGETS);

        return Object.fromEntries(entries);
      });

      setSelectedTrack((current) => current ?? data.track_id);
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

  const startReplay = () => {
    setTargets({});
    setSelectedTrack(null);
    socket.emit("radar:start");
  };

  const stopReplay = () => {
    socket.emit("radar:stop");
  };

  const progress =
    replayStatus.total_observations > 0
      ? (replayStatus.current_index / replayStatus.total_observations) * 100
      : 0;

  const radius = 300;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">PRJ-17 / REAL-TIME SENSOR SYSTEM</div>
          <h1>Radar Command Center</h1>
        </div>

        <div className="topbar-status">
          <span
            className={`status-dot ${
              connectionStatus === "Connected" ? "online" : "offline"
            }`}
          />
          <span>{connectionStatus}</span>
          <span className="separator">|</span>
          <span>{replayStatus.running ? "REPLAY ACTIVE" : "STANDBY"}</span>
        </div>
      </header>

      <main className="main-grid">
        <section className="radar-panel panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">PRIMARY SENSOR</span>
              <h2>360° Radar Scope</h2>
            </div>

            <div className="range-label">
              RANGE <strong>{MAX_RANGE} m</strong>
            </div>
          </div>

          <div className="radar-wrap">
            <svg
              className="radar-svg"
              viewBox="0 0 600 600"
              role="img"
              aria-label="Live radar display"
            >
              <defs>
                <radialGradient id="radarBackground">
                  <stop offset="0%" stopColor="#0b2420" />
                  <stop offset="65%" stopColor="#061714" />
                  <stop offset="100%" stopColor="#020807" />
                </radialGradient>

                <linearGradient
                  id="sweepGradient"
                  x1="50%"
                  y1="50%"
                  x2="50%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="rgba(65,255,181,0)" />
                  <stop offset="100%" stopColor="rgba(65,255,181,0.75)" />
                </linearGradient>

                <filter id="targetGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle
                cx="300"
                cy="300"
                r="298"
                fill="url(#radarBackground)"
                className="radar-border"
              />

              {[75, 150, 225, 300].map((r) => (
                <circle
                  key={r}
                  cx="300"
                  cy="300"
                  r={r}
                  className="radar-ring"
                />
              ))}

              <line
                x1="300"
                y1="2"
                x2="300"
                y2="598"
                className="radar-grid"
              />

              <line
                x1="2"
                y1="300"
                x2="598"
                y2="300"
                className="radar-grid"
              />

              <line
                x1="88"
                y1="88"
                x2="512"
                y2="512"
                className="radar-grid"
              />

              <line
                x1="512"
                y1="88"
                x2="88"
                y2="512"
                className="radar-grid"
              />

              <path
                d={`M 300 300 L ${
                  polarToCartesian(1000, sweepAngle - 7, radius).x
                } ${
                  polarToCartesian(1000, sweepAngle - 7, radius).y
                } A ${radius} ${radius} 0 0 1 ${
                  polarToCartesian(1000, sweepAngle, radius).x
                } ${
                  polarToCartesian(1000, sweepAngle, radius).y
                } Z`}
                className="sweep-trail"
              />

              {targetList.map((target) => {
                const point = polarToCartesian(
                  target.range_m,
                  target.azimuth_deg,
                  radius
                );

                const isSelected = target.track_id === selectedTrack;
                const isUav = target.classification === "UAV";

                return (
                  <g
                    key={target.track_id}
                    className={`target ${
                      isSelected ? "selected-target" : ""
                    }`}
                    onClick={() => setSelectedTrack(target.track_id)}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 10 : 6}
                      className={isUav ? "uav-target" : "normal-target"}
                      filter="url(#targetGlow)"
                    />

                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 16 : 11}
                      className="target-pulse"
                    />

                    {isSelected && (
                      <text
                        x={point.x + 13}
                        y={point.y - 12}
                        className="target-label"
                      >
                        T-{target.track_id}
                      </text>
                    )}
                  </g>
                );
              })}

              <circle cx="300" cy="300" r="4" className="radar-center" />

              <text x="300" y="23" textAnchor="middle" className="direction">
                0°
              </text>
              <text x="577" y="305" textAnchor="middle" className="direction">
                90°
              </text>
              <text x="300" y="590" textAnchor="middle" className="direction">
                180°
              </text>
              <text x="23" y="305" textAnchor="middle" className="direction">
                270°
              </text>
            </svg>

            <div className="radar-overlay top-left">
              <span>SWEEP</span>
              <strong>{Math.round(sweepAngle)}°</strong>
            </div>

            <div className="radar-overlay bottom-left">
              <span>TRACKS</span>
              <strong>{targetList.length}</strong>
            </div>
          </div>

          <div className="radar-legend">
            <span>
              <i className="legend-dot uav" /> UAV
            </span>
            <span>
              <i className="legend-dot detected" /> DETECTION
            </span>
            <span>
              <i className="legend-dot selected" /> SELECTED
            </span>
          </div>
        </section>

        <aside className="side-column">
          <section className="panel control-panel">
            <div className="panel-kicker">SYSTEM CONTROL</div>
            <h2>Radar Replay</h2>

            <div className="control-buttons">
              <button
                className="primary-button"
                onClick={startReplay}
                disabled={replayStatus.running}
              >
                ▶ START
              </button>

              <button
                className="secondary-button"
                onClick={stopReplay}
                disabled={!replayStatus.running}
              >
                ■ STOP
              </button>
            </div>

            <div className="progress-info">
              <div>
                <span>DATASET</span>
                <strong>
                  {replayStatus.current_index} /{" "}
                  {replayStatus.total_observations}
                </strong>
              </div>

              <div className="progress-bar">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>
          </section>

          <section className="panel analysis-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">TARGET ANALYSIS</div>
                <h2>
                  {selectedTarget
                    ? `Track ${selectedTarget.track_id}`
                    : "No Target Selected"}
                </h2>
              </div>
            </div>

            {selectedTarget ? (
              <>
                <div
                  className={`classification ${
                    selectedTarget.classification === "UAV"
                      ? "classification-uav"
                      : ""
                  }`}
                >
                  <span>CLASSIFICATION</span>
                  <strong>{selectedTarget.classification}</strong>
                  <small>
                    {(
                      selectedTarget.uav_probability * 100
                    ).toFixed(1)}
                    % CONFIDENCE
                  </small>
                </div>

                <div className="metric-grid">
                  <div className="metric">
                    <span>RANGE</span>
                    <strong>
                      {selectedTarget.range_m.toFixed(1)} m
                    </strong>
                  </div>

                  <div className="metric">
                    <span>RCS</span>
                    <strong>
                      {selectedTarget.rcs_dbsm.toFixed(2)} dBsm
                    </strong>
                  </div>

                  <div className="metric">
                    <span>AZIMUTH</span>
                    <strong>
                      {selectedTarget.azimuth_deg.toFixed(2)}°
                    </strong>
                  </div>

                  <div className="metric">
                    <span>ELEVATION</span>
                    <strong>
                      {selectedTarget.elevation_deg.toFixed(2)}°
                    </strong>
                  </div>

                  <div className="metric">
                    <span>DOPPLER</span>
                    <strong>
                      {selectedTarget.radial_velocity_mps.toFixed(2)} m/s
                    </strong>
                  </div>

                  <div className="metric">
                    <span>THREAT</span>
                    <strong
                      className={`threat-${getThreatLevel(
                        selectedTarget.uav_probability
                      ).toLowerCase()}`}
                    >
                      {getThreatLevel(selectedTarget.uav_probability)}
                    </strong>
                  </div>
                </div>

                <div className="track-meta">
                  <span>LAST TIMESTAMP</span>
                  <code>{selectedTarget.timestamp}</code>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Select a target on the radar scope.
              </div>
            )}
          </section>

          <section className="panel feed-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">LIVE TRACK FEED</div>
                <h2>Detections</h2>
              </div>

              <span className="live-badge">LIVE</span>
            </div>

            <div className="track-list">
              {targetList.slice(0, 8).map((target) => (
                <button
                  key={target.track_id}
                  className={`track-row ${
                    target.track_id === selectedTrack ? "active" : ""
                  }`}
                  onClick={() => setSelectedTrack(target.track_id)}
                >
                  <span className="track-id">
                    T-{target.track_id}
                  </span>

                  <span>
                    {target.classification}
                  </span>

                  <strong>
                    {(target.uav_probability * 100).toFixed(0)}%
                  </strong>
                </button>
              ))}

              {targetList.length === 0 && (
                <div className="empty-state">
                  Waiting for radar observations...
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>

      <footer className="footer">
        <span>PRJ-17 RADAR SYSTEM</span>
        <span>MODEL: RF UAV CLASSIFIER v2.0</span>
        <span>
          {lastUpdate
            ? `LAST UPDATE ${new Date(lastUpdate).toLocaleTimeString()}`
            : "WAITING FOR DATA"}
        </span>
      </footer>
    </div>
  );
}

export default App;
