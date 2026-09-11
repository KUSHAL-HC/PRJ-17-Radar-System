import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from "@react-three/drei";
import * as THREE from "three";

const MAX_RANGE = 1000;
const WORLD_RADIUS = 10;

/* =========================================================
   RADAR COORDINATE SYSTEM
   range  -> distance from origin
   azimuth -> horizontal direction
   elevation -> vertical angle
   ========================================================= */

function radarToWorld(
  range,
  azimuthDeg,
  elevationDeg = 0
) {
  const safeRange = THREE.MathUtils.clamp(
    Number(range) || 0,
    0,
    MAX_RANGE
  );

  const azimuth = THREE.MathUtils.degToRad(
    Number(azimuthDeg) || 0
  );

  const elevation = THREE.MathUtils.degToRad(
    Number(elevationDeg) || 0
  );

  const distance =
    (safeRange / MAX_RANGE) * WORLD_RADIUS;

  const horizontalDistance =
    distance * Math.cos(elevation);

  return [
    horizontalDistance * Math.sin(azimuth),
    distance * Math.sin(elevation),
    -horizontalDistance * Math.cos(azimuth),
  ];
}

/* =========================================================
   RADAR DOME
   ========================================================= */

function RadarDome() {
  const geometry = useMemo(() => {
    const positions = [];

    const rings = 18;
    const segments = 128;

    for (let ring = 1; ring <= rings; ring += 1) {
      const phi =
        (ring / rings) * (Math.PI / 2);

      const radius =
        Math.sin(phi) * WORLD_RADIUS;

      const y =
        Math.cos(phi) * WORLD_RADIUS;

      for (
        let segment = 0;
        segment <= segments;
        segment += 1
      ) {
        const theta =
          (segment / segments) *
          Math.PI *
          2;

        positions.push(
          radius * Math.cos(theta),
          y,
          radius * Math.sin(theta)
        );
      }
    }

    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    );
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#41ffb5"
        size={0.032}
        transparent
        opacity={0.38}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* =========================================================
   DOME HORIZONTAL CONTOURS
   ========================================================= */

function DomeContours() {
  const rings = [2, 4, 6, 8, 10];

  return (
    <group>
      {rings.map((radius) => {
        const y = Math.sqrt(
          Math.max(
            WORLD_RADIUS * WORLD_RADIUS -
              radius * radius,
            0
          )
        );

        return (
          <mesh
            key={radius}
            position={[0, y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <torusGeometry
              args={[
                radius,
                0.008,
                4,
                128,
              ]}
            />

            <meshBasicMaterial
              color="#41ffb5"
              transparent
              opacity={0.18}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* =========================================================
   RADIAL RADAR LINES
   ========================================================= */

function RadarRadials() {
  const lines = [];

  for (let i = 0; i < 24; i += 1) {
    const angle =
      (i / 24) * Math.PI * 2;

    lines.push(
      <mesh
        key={`radial-${i}`}
        position={[0, 0.02, 0]}
        rotation={[0, angle, 0]}
      >
        <boxGeometry
          args={[
            0.009,
            0.009,
            WORLD_RADIUS * 2,
          ]}
        />

        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.19}
          toneMapped={false}
        />
      </mesh>
    );
  }

  return <group>{lines}</group>;
}

/* =========================================================
   GROUND RANGE RINGS
   ========================================================= */

function GroundRings() {
  const rings = [2, 4, 6, 8, 10];

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((radius) => (
        <mesh key={radius}>
          <ringGeometry
            args={[
              radius - 0.008,
              radius,
              160,
            ]}
          />

          <meshBasicMaterial
            color="#41ffb5"
            transparent
            opacity={
              radius === 10 ? 0.24 : 0.12
            }
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* =========================================================
   RADAR SWEEP
   ========================================================= */

function RadarSweep() {
  const sweepRef = useRef();

  useFrame((_, delta) => {
    if (!sweepRef.current) return;

    sweepRef.current.rotation.y -=
      delta * 0.72;
  });

  return (
    <group
      ref={sweepRef}
      position={[0, 0.09, 0]}
    >
      {/* Main illuminated sector */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry
          args={[
            WORLD_RADIUS,
            48,
            0,
            Math.PI / 7,
          ]}
        />

        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.10}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Bright leading edge */}
      <mesh
        position={[
          0,
          0.01,
          -WORLD_RADIUS / 2,
        ]}
      >
        <boxGeometry
          args={[
            0.028,
            0.035,
            WORLD_RADIUS,
          ]}
        />

        <meshBasicMaterial
          color="#a8ffe5"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Inner sweep glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry
          args={[
            6,
            32,
            0,
            Math.PI / 7,
          ]}
        />

        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.07}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* =========================================================
   RADAR ORIGIN
   ========================================================= */

function RadarOrigin() {
  const ref = useRef();

  useFrame((state) => {
    if (!ref.current) return;

    const pulse =
      1 +
      Math.sin(
        state.clock.elapsedTime * 3
      ) *
        0.18;

    ref.current.scale.setScalar(pulse);
  });

  return (
    <group position={[0, 0.18, 0]}>
      <mesh ref={ref}>
        <sphereGeometry
          args={[0.11, 20, 20]}
        />

        <meshBasicMaterial
          color="#d9fff2"
          toneMapped={false}
        />
      </mesh>

      <mesh>
        <ringGeometry
          args={[0.18, 0.205, 32]}
        />

        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* =========================================================
   TARGET
   ========================================================= */

function Target({
  target,
  selected,
  onSelect,
}) {
  const groupRef = useRef();
  const pulseRef = useRef();

  const position = useMemo(
    () =>
      radarToWorld(
        target.range_m,
        target.azimuth_deg,
        target.elevation_deg
      ),
    [
      target.range_m,
      target.azimuth_deg,
      target.elevation_deg,
    ]
  );

  const isUav =
    target.classification === "UAV";

  const probability =
    Number(target.uav_probability) || 0;

  const threat =
    probability >= 0.8
      ? "HIGH"
      : probability >= 0.5
        ? "MEDIUM"
        : "LOW";

  const targetColor = selected
    ? "#ffffff"
    : threat === "HIGH"
      ? "#ff5f56"
      : isUav
        ? "#41ffb5"
        : "#ffb84d";

  const altitude = Math.abs(
    position[1]
  );

  useFrame((state) => {
    const time =
      state.clock.elapsedTime;

    if (groupRef.current) {
      const pulse =
        1 +
        Math.sin(time * 4.5) *
          0.10;

      groupRef.current.scale.setScalar(
        selected ? 1.3 * pulse : pulse
      );
    }

    if (pulseRef.current) {
      pulseRef.current.rotation.z =
        time * 0.8;

      pulseRef.current.material.opacity =
        0.35 +
        Math.sin(time * 4.5) *
          0.18;
    }
  });

  return (
    <group>
      {/* Altitude / elevation stem */}
      {altitude > 0.08 && (
        <mesh
          position={[
            position[0],
            position[1] / 2,
            position[2],
          ]}
        >
          <cylinderGeometry
            args={[
              0.006,
              0.006,
              altitude,
              6,
            ]}
          />

          <meshBasicMaterial
            color={targetColor}
            transparent
            opacity={
              selected ? 0.48 : 0.18
            }
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Target */}
      <group
        ref={groupRef}
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(target.track_id);
        }}
      >
        {/* Main contact */}
        <mesh>
          <octahedronGeometry
            args={[
              selected ? 0.16 : 0.105,
              1,
            ]}
          />

          <meshBasicMaterial
            color={targetColor}
            toneMapped={false}
          />
        </mesh>

        {/* Horizontal target wings */}
        {isUav && (
          <>
            <mesh
              position={[0, 0, 0]}
              rotation={[
                0,
                0,
                Math.PI / 2,
              ]}
            >
              <boxGeometry
                args={[0.025, 0.34, 0.055]}
              />

              <meshBasicMaterial
                color={targetColor}
                toneMapped={false}
              />
            </mesh>

            <mesh
              position={[0, 0, 0]}
              rotation={[
                0,
                0,
                Math.PI / 2,
              ]}
            >
              <coneGeometry
                args={[
                  0.08,
                  0.32,
                  4,
                ]}
              />

              <meshBasicMaterial
                color={targetColor}
                transparent
                opacity={0.82}
                toneMapped={false}
              />
            </mesh>
          </>
        )}

        {/* Contact pulse */}
        <mesh
          ref={pulseRef}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry
            args={[
              selected ? 0.25 : 0.17,
              selected ? 0.285 : 0.20,
              32,
            ]}
          />

          <meshBasicMaterial
            color={targetColor}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        {/* Selected lock rings */}
        {selected && (
          <>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry
                args={[
                  0.36,
                  0.375,
                  32,
                ]}
              />

              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.8}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>

            <mesh
              rotation={[0, 0, 0]}
            >
              <ringGeometry
                args={[
                  0.36,
                  0.375,
                  32,
                ]}
              />

              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.35}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>

            <Text
              position={[
                0.28,
                0.27,
                0,
              ]}
              fontSize={0.21}
              color="#e1fff4"
              anchorX="left"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor="#020706"
            >
              {`T-${target.track_id}`}
            </Text>

            <Text
              position={[
                0.28,
                0.04,
                0,
              ]}
              fontSize={0.105}
              color="#41ffb5"
              anchorX="left"
              anchorY="middle"
            >
              {`${Math.round(
                probability * 100
              )}% UAV`}
            </Text>
          </>
        )}
      </group>
    </group>
  );
}

/* =========================================================
   TARGET LAYER
   ========================================================= */

function Targets({
  targets,
  selectedTrack,
  onSelect,
}) {
  return (
    <group>
      {targets.map((target) => (
        <Target
          key={target.track_id}
          target={target}
          selected={
            target.track_id ===
            selectedTrack
          }
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/* =========================================================
   CARDINAL DIRECTIONS
   ========================================================= */

function CardinalLabels() {
  return (
    <group>
      <Text
        position={[
          0,
          0.28,
          -10.7,
        ]}
        fontSize={0.3}
        color="#41ffb5"
        anchorX="center"
      >
        N
      </Text>

      <Text
        position={[
          10.7,
          0.28,
          0,
        ]}
        fontSize={0.3}
        color="#41ffb5"
        anchorX="center"
      >
        E
      </Text>

      <Text
        position={[
          0,
          0.28,
          10.7,
        ]}
        fontSize={0.3}
        color="#41ffb5"
        anchorX="center"
      >
        S
      </Text>

      <Text
        position={[
          -10.7,
          0.28,
          0,
        ]}
        fontSize={0.3}
        color="#41ffb5"
        anchorX="center"
      >
        W
      </Text>
    </group>
  );
}

/* =========================================================
   TERRAIN
   ========================================================= */

function Terrain() {
  const geometry = useMemo(() => {
    const size = 20;
    const segments = 100;

    const geo =
      new THREE.PlaneGeometry(
        size,
        size,
        segments,
        segments
      );

    const position =
      geo.attributes.position;

    for (
      let i = 0;
      i < position.count;
      i += 1
    ) {
      const x = position.getX(i);
      const y = position.getY(i);

      const distance = Math.sqrt(
        x * x + y * y
      );

      const broadTerrain =
        Math.sin(x * 0.55) * 0.06 +
        Math.cos(y * 0.45) * 0.05;

      const detail =
        Math.sin(
          (x + y) * 1.2
        ) * 0.018 +
        Math.cos(
          (x - y) * 0.8
        ) * 0.014;

      const height =
        broadTerrain + detail;

      position.setZ(
        i,
        distance < 10
          ? height
          : 0
      );
    }

    geo.computeVertexNormals();

    return geo;
  }, []);

  return (
    <mesh
      geometry={geometry}
      rotation={[
        -Math.PI / 2,
        0,
        0,
      ]}
      position={[0, -0.05, 0]}
    >
      <meshBasicMaterial
        color="#0a211a"
        wireframe
        transparent
        opacity={0.42}
      />
    </mesh>
  );
}

/* =========================================================
   ATMOSPHERIC VERTICAL AXIS
   ========================================================= */

function AltitudeAxis() {
  return (
    <group>
      {[2, 4, 6, 8].map((height) => (
        <mesh
          key={height}
          position={[
            0,
            height,
            0,
          ]}
        >
          <torusGeometry
            args={[
              Math.max(
                1,
                height * 0.75
              ),
              0.006,
              4,
              96,
            ]}
          />

          <meshBasicMaterial
            color="#41ffb5"
            transparent
            opacity={0.055}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* =========================================================
   MAIN SCENE
   ========================================================= */

function RadarScene({
  targets,
  selectedTrack,
  onSelect,
}) {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[
          13,
          11,
          15,
        ]}
        fov={46}
      />

      <color
        attach="background"
        args={["#010706"]}
      />

      <fog
        attach="fog"
        args={[
          "#010706",
          17,
          36,
        ]}
      />

      <ambientLight intensity={0.32} />

      <group
        position={[
          0,
          -0.65,
          0,
        ]}
      >
        <Terrain />

        <GroundRings />

        <RadarDome />

        <DomeContours />

        <RadarRadials />

        <AltitudeAxis />

        <RadarSweep />

        <RadarOrigin />

        <CardinalLabels />

        <Targets
          targets={targets}
          selectedTrack={selectedTrack}
          onSelect={onSelect}
        />
      </group>

      <Grid
        position={[
          0,
          -0.82,
          0,
        ]}
        args={[32, 32]}
        cellSize={1}
        cellThickness={0.35}
        cellColor="#123e34"
        sectionSize={5}
        sectionThickness={0.65}
        sectionColor="#23725d"
        fadeDistance={29}
        fadeStrength={1.15}
        infiniteGrid
      />

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={11}
        maxDistance={26}
        minPolarAngle={0.65}
        maxPolarAngle={1.48}
        target={[
          0,
          1.7,
          0,
        ]}
      />
    </>
  );
}

/* =========================================================
   PUBLIC COMPONENT
   ========================================================= */

export default function Radar3D({
  targets = [],
  selectedTrack = null,
  onSelect = () => {},
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference:
            "high-performance",
        }}
      >
        <RadarScene
          targets={targets}
          selectedTrack={selectedTrack}
          onSelect={onSelect}
        />
      </Canvas>
    </div>
  );
}