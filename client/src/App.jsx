import { useEffect, useMemo, useState } from "react";
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
            <Radar3D
              targets={targetList}
              selectedTrack={selectedTrack}
              onSelect={setSelectedTrack}
            />

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

      <section className="bottom-command-panel">
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
              {targetList.slice(0, 6).map((target) => {
                const threat = getThreatLevel(
                  target.uav_probability
                );

                return (
                  <tr
                    key={target.track_id}
                    className={
                      target.track_id === selectedTrack
                        ? "selected-row"
                        : ""
                    }
                    onClick={() =>
                      setSelectedTrack(target.track_id)
                    }
                  >
                    <td className="track-cell">
                      T-{target.track_id}
                    </td>

                    <td>{target.classification}</td>

                    <td>
                      {(target.uav_probability * 100).toFixed(0)}%
                    </td>

                    <td>
                      {formatNumber(target.range_m, 1)} m
                    </td>

                    <td>
                      {formatNumber(
                        target.azimuth_deg,
                        1
                      )}
                      °
                    </td>

                    <td>
                      {formatNumber(
                        target.elevation_deg,
                        1
                      )}
                      °
                    </td>

                    <td>
                      {formatNumber(target.rcs_dbsm, 2)}
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
              NO ACTIVE CONTACTS — RADAR SYSTEM AWAITING SENSOR DATA
            </div>
          )}
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