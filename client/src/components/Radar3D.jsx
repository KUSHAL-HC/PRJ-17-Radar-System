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

/* ---------------------------------------------------------
   Convert radar coordinates into a 3D position.

   X = left/right
   Y = elevation
   Z = forward/back
   --------------------------------------------------------- */

function radarToWorld(range, azimuthDeg, elevationDeg = 0) {
  const horizontalRange = Math.min(
    Math.max(Number(range) || 0, 0),
    MAX_RANGE
  );

  const azimuth = THREE.MathUtils.degToRad(Number(azimuthDeg) || 0);
  const elevation = THREE.MathUtils.degToRad(Number(elevationDeg) || 0);

  const distance = (horizontalRange / MAX_RANGE) * 10;

  const horizontalDistance = distance * Math.cos(elevation);

  return [
    horizontalDistance * Math.sin(azimuth),
    distance * Math.sin(elevation),
    -horizontalDistance * Math.cos(azimuth),
  ];
}

/* ---------------------------------------------------------
   Radar dome
   --------------------------------------------------------- */

function RadarDome() {
  const geometry = useMemo(() => {
    const points = [];

    const rings = 12;
    const segments = 96;

    for (let ring = 1; ring <= rings; ring += 1) {
      const phi = (ring / rings) * (Math.PI / 2);
      const radius = Math.sin(phi) * 10;
      const y = Math.cos(phi) * 10;

      for (let segment = 0; segment <= segments; segment += 1) {
        const theta = (segment / segments) * Math.PI * 2;

        points.push(
          radius * Math.cos(theta),
          y,
          radius * Math.sin(theta)
        );
      }
    }

    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3)
    );
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#41ffb5"
        size={0.025}
        transparent
        opacity={0.28}
        sizeAttenuation
      />
    </points>
  );
}

/* ---------------------------------------------------------
   Radar rings
   --------------------------------------------------------- */

function RadarRings() {
  const rings = [2, 4, 6, 8, 10];

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((radius) => (
        <mesh key={radius}>
          <ringGeometry args={[radius - 0.008, radius, 128]} />
          <meshBasicMaterial
            color="#41ffb5"
            transparent
            opacity={0.09}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------
   Radar latitude / longitude lines
   --------------------------------------------------------- */

function RadarGrid() {
  const lines = [];

  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;

    lines.push(
      <mesh
        key={`radial-${i}`}
        rotation={[0, angle, 0]}
        position={[0, 0.01, 0]}
      >
        <boxGeometry args={[0.012, 0.012, 20]} />
        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.18}
        />
      </mesh>
    );
  }

  return <group>{lines}</group>;
}

/* ---------------------------------------------------------
   Sweep beam
   --------------------------------------------------------- */

function RadarSweep() {
  const sweepRef = useRef();

  useFrame((_, delta) => {
    if (!sweepRef.current) return;

    sweepRef.current.rotation.y -= delta * 0.75;
  });

  return (
    <group ref={sweepRef} position={[0, 0.12, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[10, 3, 0, Math.PI / 8]} />
        <meshBasicMaterial
          color="#41ffb5"
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh position={[0, 0, -5]}>
        <boxGeometry args={[0.025, 0.03, 10]} />
        <meshBasicMaterial
          color="#8fffff"
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------
   Radar center
   --------------------------------------------------------- */

function RadarOrigin() {
  return (
    <mesh position={[0, 0.2, 0]}>
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshBasicMaterial
        color="#41ffb5"
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------------------------------------------------------
   Individual target
   --------------------------------------------------------- */

function Target({
  target,
  selected,
  onSelect,
}) {
  const groupRef = useRef();
  const pointRef = useRef();

  const position = useMemo(
    () =>
      radarToWorld(
        target.range_m,
        target.azimuth_deg,
        target.elevation_deg
      ),
    [target.range_m, target.azimuth_deg, target.elevation_deg]
  );

  const isUav = target.classification === "UAV";

  const threat =
    target.uav_probability >= 0.8
      ? "HIGH"
      : target.uav_probability >= 0.5
        ? "MEDIUM"
        : "LOW";

  const targetColor =
    selected
      ? "#ffffff"
      : threat === "HIGH"
        ? "#ff5f56"
        : isUav
          ? "#41ffb5"
          : "#ffb84d";

  useFrame((state) => {
    if (!groupRef.current) return;

    const pulse =
      1 + Math.sin(state.clock.elapsedTime * 4.5) * 0.12;

    groupRef.current.scale.setScalar(
      selected ? 1.25 * pulse : pulse
    );

    if (pointRef.current) {
      pointRef.current.material.opacity =
        0.45 + Math.sin(state.clock.elapsedTime * 4.5) * 0.2;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(target.track_id);
      }}
    >
      <mesh>
        <sphereGeometry args={[selected ? 0.13 : 0.09, 16, 16]} />
        <meshBasicMaterial
          color={targetColor}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={pointRef}>
        <ringGeometry
          args={[
            selected ? 0.19 : 0.14,
            selected ? 0.23 : 0.17,
            24,
          ]}
        />
        <meshBasicMaterial
          color={targetColor}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {selected && (
        <Text
          position={[0.22, 0.22, 0]}
          fontSize={0.22}
          color="#d8fff3"
          anchorX="left"
          anchorY="middle"
        >
          {`T-${target.track_id}`}
        </Text>
      )}
    </group>
  );
}

/* ---------------------------------------------------------
   Target layer
   --------------------------------------------------------- */

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
          selected={target.track_id === selectedTrack}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------
   Cardinal directions
   --------------------------------------------------------- */

function CardinalLabels() {
  return (
    <group>
      <Text
        position={[0, 0.35, -10.7]}
        fontSize={0.32}
        color="#41ffb5"
        anchorX="center"
      >
        N
      </Text>

      <Text
        position={[10.7, 0.35, 0]}
        fontSize={0.32}
        color="#41ffb5"
        anchorX="center"
      >
        E
      </Text>

      <Text
        position={[0, 0.35, 10.7]}
        fontSize={0.32}
        color="#41ffb5"
        anchorX="center"
      >
        S
      </Text>

      <Text
        position={[-10.7, 0.35, 0]}
        fontSize={0.32}
        color="#41ffb5"
        anchorX="center"
      >
        W
      </Text>
    </group>
  );
}

/* ---------------------------------------------------------
   Terrain-like surface
   --------------------------------------------------------- */

function Terrain() {
  const geometry = useMemo(() => {
    const size = 20;
    const segments = 80;

    const geo = new THREE.PlaneGeometry(
      size,
      size,
      segments,
      segments
    );

    const position = geo.attributes.position;

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);

      const distance = Math.sqrt(x * x + y * y);

      const height =
        Math.sin(x * 0.65) * 0.04 +
        Math.cos(y * 0.55) * 0.035 +
        Math.sin((x + y) * 0.35) * 0.025;

      position.setZ(
        i,
        distance < 9.8 ? height : 0
      );
    }

    geo.computeVertexNormals();

    return geo;
  }, []);

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.04, 0]}
    >
      <meshBasicMaterial
        color="#071814"
        wireframe
        transparent
        opacity={0.34}
      />
    </mesh>
  );
}

/* ---------------------------------------------------------
   Main scene
   --------------------------------------------------------- */

function RadarScene({
  targets,
  selectedTrack,
  onSelect,
}) {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[13, 12, 15]}
        fov={48}
      />

      <ambientLight intensity={0.5} />

      <color attach="background" args={["#020706"]} />

      <fog
        attach="fog"
        args={["#020706", 18, 38]}
      />

      <group position={[0, -0.6, 0]}>
        <Terrain />
        <RadarDome />
        <RadarRings />
        <RadarGrid />
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
        position={[0, -0.75, 0]}
        args={[30, 30]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#174f42"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#2a8d73"
        fadeDistance={28}
        fadeStrength={1}
        infiniteGrid
      />

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={12}
        maxDistance={27}
        minPolarAngle={0.7}
        maxPolarAngle={1.45}
        target={[0, 1.5, 0]}
      />
    </>
  );
}

/* ---------------------------------------------------------
   Public component
   --------------------------------------------------------- */

export default function Radar3D({
  targets = [],
  selectedTrack = null,
  onSelect = () => {},
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "500px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
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