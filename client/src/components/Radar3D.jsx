import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import TerrainLandscape from "./terrain/TerrainLandscape";

const MAX_RANGE = 1000;
const WORLD_RADIUS = 10;
const MAX_TRAIL_POINTS = 70;

/* =========================================================
   RADAR COORDINATES → 3D WORLD
   ========================================================= */

function radarToWorld(
  range,
  azimuthDeg,
  elevationDeg = 0
) {
  const r = THREE.MathUtils.clamp(
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

  const horizontal =
    (r / MAX_RANGE) * WORLD_RADIUS;

  return new THREE.Vector3(
    Math.sin(azimuth) *
      horizontal *
      Math.cos(elevation),

    Math.sin(elevation) * horizontal,

    -Math.cos(azimuth) *
      horizontal *
      Math.cos(elevation)
  );
}

/* =========================================================
   ANGLE UTILITIES
   ========================================================= */

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function angleDifference(a, b) {
  const diff =
    Math.abs(
      normalizeAngle(a) -
        normalizeAngle(b)
    );

  return Math.min(diff, 360 - diff);
}

/* =========================================================
   RADAR DOME
   ========================================================= */

function RadarDome() {
  const geometry = useMemo(() => {
    const positions = [];
    const colors = [];

    for (let layer = 0; layer < 22; layer++) {
      const y =
        (layer / 21) * WORLD_RADIUS;

      const radius = Math.sqrt(
        Math.max(
          0,
          WORLD_RADIUS ** 2 - y ** 2
        )
      );

      for (let i = 0; i < 160; i++) {
        const angle =
          (i / 160) * Math.PI * 2;

        const noise =
          0.94 +
          Math.sin(
            i * 2.7 + layer
          ) *
            0.025;

        const r = radius * noise;

        positions.push(
          Math.cos(angle) * r,
          y,
          Math.sin(angle) * r
        );

        const brightness =
          0.18 +
          (layer / 21) * 0.18;

        colors.push(
          0.04 * brightness,
          1.0 * brightness,
          0.62 * brightness
        );
      }
    }

    const geo =
      new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    );

    geo.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        colors,
        3
      )
    );

    return geo;
  }, []);

  return (
    <group>
      <points geometry={geometry}>
        <pointsMaterial
          size={0.035}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={
            THREE.AdditiveBlending
          }
        />
      </points>

      <mesh>
        <sphereGeometry
          args={[
            WORLD_RADIUS,
            48,
            24,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ]}
        />

        <meshBasicMaterial
          color="#06352a"
          transparent
          opacity={0.19}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* =========================================================
   RANGE RINGS
   ========================================================= */

function RangeRings() {
  return (
    <group
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {[2, 4, 6, 8, 10].map(
        (radius) => (
          <mesh key={radius}>
            <ringGeometry
              args={[
                radius - 0.015,
                radius,
                128,
              ]}
            />

            <meshBasicMaterial
              color="#168f70"
              transparent
              opacity={
                radius === 10
                  ? 0.4
                  : 0.22
              }
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      )}
    </group>
  );
}

/* =========================================================
   RADIAL LINES
   ========================================================= */

function Radials() {
  const geometry = useMemo(() => {
    const points = [];

    for (let i = 0; i < 36; i++) {
      const angle =
        (i / 36) * Math.PI * 2;

      points.push(
        new THREE.Vector3(
          0,
          0.025,
          0
        ),

        new THREE.Vector3(
          Math.sin(angle) *
            WORLD_RADIUS,
          0.025,
          Math.cos(angle) *
            WORLD_RADIUS
        )
      );
    }

    return new THREE.BufferGeometry().setFromPoints(
      points
    );
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#0e765c"
        transparent
        opacity={0.3}
      />
    </lineSegments>
  );
}

/* =========================================================
   ALTITUDE CONTOURS
   ========================================================= */

function AltitudeContours() {
  const contours = [];

  for (let i = 1; i <= 7; i++) {
    const y =
      (i / 8) * WORLD_RADIUS;

    const radius = Math.sqrt(
      Math.max(
        0,
        WORLD_RADIUS ** 2 - y ** 2
      )
    );

    contours.push({
      y,
      radius,
    });
  }

  return (
    <group>
      {contours.map(
        (item, index) => (
          <mesh
            key={index}
            position={[
              0,
              item.y,
              0,
            ]}
            rotation={[
              -Math.PI / 2,
              0,
              0,
            ]}
          >
            <ringGeometry
              args={[
                item.radius * 0.985,
                item.radius,
                96,
              ]}
            />

            <meshBasicMaterial
              color="#1db58b"
              transparent
              opacity={0.065}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )
      )}
    </group>
  );
}

/* =========================================================
   TERRAIN
   ========================================================= */
function RadarSweep({
  sweepAngle,
  sweepState,
}) {
  const sweepRef = useRef();

  useFrame((_, delta) => {
    if (!sweepRef.current) {
      return;
    }

    /*
     * Keep the sweep synchronized with the existing
     * radar animation and target-detection system.
     */
    sweepRef.current.rotation.y +=
      delta * 0.75;

    const worldRotation =
      sweepRef.current.rotation.y;

    const degrees =
      THREE.MathUtils.radToDeg(
        worldRotation
      );

    sweepState.current =
      normalizeAngle(-degrees);
  });

  const beamColor = "#39ffc2";

  return (
    <group
      ref={sweepRef}
      rotation={[
        0,
        -THREE.MathUtils.degToRad(
          Number(sweepAngle) || 0
        ),
        0,
      ]}
      position={[
        0,
        0.14,
        0,
      ]}
    >

      {/* =================================================
          BROAD RADAR SWEEP FIELD
         ================================================= */}

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
      >
        <circleGeometry
          args={[
            10,
            96,
            0,
            Math.PI / 5.2,
          ]}
        />

        <meshBasicMaterial
          color={beamColor}
          transparent
          opacity={0.035}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>


      {/* =================================================
          SECONDARY FADE
         ================================================= */}

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
      >
        <circleGeometry
          args={[
            10,
            96,
            0,
            Math.PI / 12,
          ]}
        />

        <meshBasicMaterial
          color="#7affdc"
          transparent
          opacity={0.065}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>


      {/* =================================================
          INNER HOT ZONE
         ================================================= */}

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
      >
        <circleGeometry
          args={[
            10,
            64,
            0,
            Math.PI / 28,
          ]}
        />

        <meshBasicMaterial
          color="#b8ffe9"
          transparent
          opacity={0.10}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>


      {/* =================================================
          PRIMARY SWEEP BEAM
         ================================================= */}

      <mesh
        position={[
          0,
          0,
          -5,
        ]}
      >
        <boxGeometry
          args={[
            0.035,
            0.035,
            10,
          ]}
        />

        <meshBasicMaterial
          color="#baffed"
          transparent
          opacity={1}
          toneMapped={false}
        />
      </mesh>


      {/* =================================================
          BEAM GLOW
         ================================================= */}

      <mesh
        position={[
          0,
          0,
          -5,
        ]}
      >
        <boxGeometry
          args={[
            0.13,
            0.035,
            10,
          ]}
        />

        <meshBasicMaterial
          color={beamColor}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>


      {/* =================================================
          OUTER BEAM HALO
         ================================================= */}

      <mesh
        position={[
          0,
          0,
          -5,
        ]}
      >
        <boxGeometry
          args={[
            0.32,
            0.02,
            10,
          ]}
        />

        <meshBasicMaterial
          color={beamColor}
          transparent
          opacity={0.045}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>


      {/* =================================================
          RADIAL BEAM ENDPOINT
         ================================================= */}

      <mesh
        position={[
          0,
          0,
          -9.9,
        ]}
      >
        <sphereGeometry
          args={[
            0.055,
            12,
            12,
          ]}
        />

        <meshBasicMaterial
          color="#d9fff5"
          toneMapped={false}
        />
      </mesh>


      {/* =================================================
          ORIGIN SENSOR GLOW
         ================================================= */}

      <mesh>
        <sphereGeometry
          args={[
            0.075,
            16,
            16,
          ]}
        />

        <meshBasicMaterial
          color="#d9fff5"
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

  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }

    const scale =
      1 +
      Math.sin(
        clock.elapsedTime * 3
      ) *
        0.2;

    ref.current.scale.set(
      scale,
      scale,
      scale
    );
  });

  return (
    <group
      position={[
        0,
        0.08,
        0,
      ]}
    >
      <mesh ref={ref}>
        <sphereGeometry
          args={[
            0.12,
            20,
            20,
          ]}
        />

        <meshBasicMaterial
          color="#54ffd1"
        />
      </mesh>

      <pointLight
        color="#28ffbd"
        intensity={1.1}
        distance={3}
      />
    </group>
  );
}

/* =========================================================
   TARGET TRAIL
   ========================================================= */

function TargetTrail({
  color,
  trailRef,
  lineRef,
}) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(
      MAX_TRAIL_POINTS * 3
    );

    const alpha = new Float32Array(
      MAX_TRAIL_POINTS
    );

    const geo = new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        positions,
        3
      )
    );

    geo.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(
        alpha,
        1
      )
    );

    geo.setDrawRange(0, 0);

    return geo;
  }, []);

  const trailColor = useMemo(
    () => new THREE.Color(color),
    [color]
  );

  useEffect(() => {
    lineRef.current = geometry;

    return () => {
      geometry.dispose();
    };
  }, [geometry, lineRef]);

  useFrame(() => {
    const points = trailRef.current;

    if (
      !points ||
      points.length < 2
    ) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const positionAttribute =
      geometry.attributes.position;

    const alphaAttribute =
      geometry.attributes.aAlpha;

    const max = Math.min(
      points.length,
      MAX_TRAIL_POINTS
    );

    for (let i = 0; i < max; i++) {
      const point =
        points[
          points.length - max + i
        ];

      positionAttribute.setXYZ(
        i,
        point.x,
        point.y,
        point.z
      );

      /*
       * Oldest point = faint.
       * Newest point = fully visible.
       */
      const normalized =
        i / Math.max(max - 1, 1);

      const fade =
        Math.pow(
          normalized,
          1.35
        );

      alphaAttribute.setX(
        i,
        0.04 + fade * 0.9
      );
    }

    positionAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;

    geometry.setDrawRange(
      0,
      max
    );
  });

  return (
    <line geometry={geometry}>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uColor: {
            value: trailColor,
          },
        }}
        vertexShader={`
          attribute float aAlpha;

          varying float vAlpha;

          void main() {
            vAlpha = aAlpha;

            vec4 mvPosition =
              modelViewMatrix *
              vec4(position, 1.0);

            gl_Position =
              projectionMatrix *
              mvPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;

          varying float vAlpha;

          void main() {
            gl_FragColor =
              vec4(
                uColor,
                vAlpha * 0.42
              );
          }
        `}
      />
    </line>
  );
}

/* =========================================================
   INDIVIDUAL TARGET
   ========================================================= */

function Target({
  target,
  selected,
  sweepState,
  onSelect,
}) {
  const group = useRef();
  const pulse = useRef();
  const detectionRing = useRef();

  const currentPosition =
    useRef(
      radarToWorld(
        target.range_m,
        target.azimuth_deg,
        target.elevation_deg
      )
    );

  const desiredPosition =
    useMemo(
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

  const trailRef =
    useRef([]);

  const trailLineRef =
    useRef(null);

  const lastSweepRef =
    useRef(-999);

  const threat = String(
    target.threat_level ||
      target.threat ||
      ""
  ).toUpperCase();

  const high =
    threat === "HIGH";

  const medium =
    threat === "MEDIUM";

  const color = high
    ? "#ff5050"
    : medium
    ? "#ffd166"
    : "#39ffc2";

  const confidence = Number(
    target.uav_probability ??
      target.confidence ??
      0
  );

  useFrame(
    ({ clock }, delta) => {
      if (!group.current) {
        return;
      }

      /* -----------------------------------------
         Smooth target movement
         ----------------------------------------- */

      const smoothing =
        1 -
        Math.exp(
          -delta * 5.5
        );

      currentPosition.current.lerp(
        desiredPosition,
        smoothing
      );

      group.current.position.copy(
        currentPosition.current
      );

      /* -----------------------------------------
         Store target trail
         ----------------------------------------- */

      const trail =
        trailRef.current;

      const last =
        trail[
          trail.length - 1
        ];

      if (
        !last ||
        last.distanceTo(
          currentPosition.current
        ) > 0.015
      ) {
        trail.push(
          currentPosition.current.clone()
        );

        if (
          trail.length >
          MAX_TRAIL_POINTS
        ) {
          trail.shift();
        }
      }

      /* -----------------------------------------
         Target pulse
         ----------------------------------------- */

      const pulseWave =
        Math.sin(
          clock.elapsedTime * 5
        );

      if (pulse.current) {
        const base =
          selected
            ? 1.28
            : 1;

        const scale =
          base +
          pulseWave * 0.13;

        pulse.current.scale.setScalar(
          scale
        );
      }

      /* -----------------------------------------
         Sweep detection
         ----------------------------------------- */

      const targetAzimuth =
        normalizeAngle(
          Number(
            target.azimuth_deg
          ) || 0
        );

      const sweepAngleNow =
        normalizeAngle(
          sweepState.current
        );

      const difference =
        angleDifference(
          targetAzimuth,
          sweepAngleNow
        );

      const sweepHit =
        difference < 7;

      if (
        sweepHit &&
        Math.abs(
          sweepAngleNow -
            lastSweepRef.current
        ) > 20
      ) {
        lastSweepRef.current =
          sweepAngleNow;
      }

      if (
        detectionRing.current
      ) {
        const targetScale =
          sweepHit
            ? 1.45
            : selected
            ? 1.15
            : 1;

        detectionRing.current.scale.lerp(
          new THREE.Vector3(
            targetScale,
            targetScale,
            targetScale
          ),
          0.16
        );

        detectionRing.current.material.opacity =
          sweepHit
            ? 1
            : selected
            ? 0.8
            : 0.48;
      }
    }
  );

  return (
    <group>
      {/* ---------------------------------------
          Target trail
      --------------------------------------- */}

      <TargetTrail
        color={color}
        trailRef={trailRef}
        lineRef={trailLineRef}
      />

      {/* ---------------------------------------
          Target body
      --------------------------------------- */}

      <group
      ref={group}
      onClick={(event) => {event.stopPropagation();onSelect?.(target.track_id);}}>
        {/* Altitude stem */}
        <line>
          <bufferGeometry
            attach="geometry"
            onUpdate={(geometry) => {
              geometry.setFromPoints([
                new THREE.Vector3(
                  0,
                  -currentPosition.current.y,
                  0
                ),
                new THREE.Vector3(
                  0,
                  0,
                  0
                ),
              ]);
            }}
          />

          <lineBasicMaterial
            color={color}
            transparent
            opacity={0.5}
          />
        </line>

        {/* Target core */}
       {/* =================================================
    TARGET CONTACT CORE
   ================================================= */}

{/* Outer energy field */}
<mesh
  scale={
    selected
      ? 1.15
      : 1
  }
>
  <sphereGeometry
    args={[
      selected
        ? 0.34
        : 0.23,
      16,
      16,
    ]}
  />

  <meshBasicMaterial
    color={color}
    transparent
    opacity={
      selected
        ? 0.10
        : 0.055
    }
    depthWrite={false}
    blending={
      THREE.AdditiveBlending
    }
  />
</mesh>


{/* Main target body */}
<mesh ref={pulse}>
  <octahedronGeometry
    args={[
      selected
        ? 0.30
        : 0.20,
      1,
    ]}
  />

  <meshBasicMaterial
    color={color}
    wireframe={!selected}
    toneMapped={false}
  />
</mesh>


{/* Bright contact point */}
<mesh>
  <sphereGeometry
    args={[
      selected
        ? 0.095
        : 0.065,
      12,
      12,
    ]}
  />

  <meshBasicMaterial
    color="#eafff9"
    toneMapped={false}
  />
</mesh>


{/* =================================================
    CONTACT CROSSHAIR
   ================================================= */}

<group>
  {/* Horizontal */}
  <mesh
    position={[
      0,
      0,
      0,
    ]}
  >
    <boxGeometry
      args={[
        selected
          ? 1.15
          : 0.65,
        0.008,
        0.008,
      ]}
    />

    <meshBasicMaterial
      color={color}
      transparent
      opacity={
        selected
          ? 0.75
          : 0.35
      }
      toneMapped={false}
    />
  </mesh>

  {/* Vertical */}
  <mesh
    position={[
      0,
      0,
      0,
    ]}
  >
    <boxGeometry
      args={[
        0.008,
        0.008,
        selected
          ? 1.15
          : 0.65,
      ]}
    />

    <meshBasicMaterial
      color={color}
      transparent
      opacity={
        selected
          ? 0.75
          : 0.35
      }
      toneMapped={false}
    />
  </mesh>
</group>
        {/* Detection ring */}
        <mesh
          ref={detectionRing}
          rotation={[
            -Math.PI / 2,
            0,
            0,
          ]}
        >
          <ringGeometry
            args={[
              selected
                ? 0.42
                : 0.23,
              selected
                ? 0.45
                : 0.26,
              32,
            ]}
          />

          <meshBasicMaterial
            color={color}
            transparent
            opacity={
              selected
                ? 0.8
                : 0.48
            }
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Selected tracking halo */}
        {selected && (
          <>
            <mesh>
              <torusGeometry
                args={[
                  0.55,
                  0.018,
                  8,
                  48,
                ]}
              />

              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.85}
              />
            </mesh>

            <mesh>
              <sphereGeometry
                args={[
                  0.38,
                  16,
                  16,
                ]}
              />

              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.035}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={
                  THREE.AdditiveBlending
                }
              />
            </mesh>
          </>
        )}

        {/* Track label */}
        <Text
          position={[
            0.3,
            0.24,
            0,
          ]}
          fontSize={
            selected
              ? 0.22
              : 0.16
          }
          color={color}
          anchorX="left"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#00110c"
        >
          {target.track_id ||
            "UNKNOWN"}
        </Text>

        {/* Classification */}
        {selected && (
          <Text
            position={[
              0.3,
              -0.01,
              0,
            ]}
            fontSize={0.12}
            color="#b9fff0"
            anchorX="left"
          >
            {`UAV ${(
              confidence * 100
            ).toFixed(0)}%`}
          </Text>
        )}
      </group>
    </group>
  );
}

/* =========================================================
   TARGET COLLECTION
   ========================================================= */
  
function Targets({
  targets,
  selectedTrack,
  sweepState,
  onSelect,
}) {
  return (
    <group>
      {targets.map(
        (target, index) => (
          <Target
            key={
              target.track_id ||
              target.id ||
              index
            }
            target={target}
            selected={
              String(
                target.track_id
              ) ===
              String(
                selectedTrack
              )
            }
            sweepState={
              sweepState
            }
            onSelect={
              onSelect
            }
          />
        )
      )}
    </group>
  );
}

/* =========================================================
   CARDINAL DIRECTIONS
   ========================================================= */

function CardinalLabels() {
  return (
    <>
      <Text
        position={[
          0,
          0.15,
          -10.6,
        ]}
        fontSize={0.23}
        color="#4dffcf"
      >
        N
      </Text>

      <Text
        position={[
          10.6,
          0.15,
          0,
        ]}
        fontSize={0.23}
        color="#4dffcf"
      >
        E
      </Text>

      <Text
        position={[
          0,
          0.15,
          10.6,
        ]}
        fontSize={0.23}
        color="#4dffcf"
      >
        S
      </Text>

      <Text
        position={[
          -10.6,
          0.15,
          0,
        ]}
        fontSize={0.23}
        color="#4dffcf"
      >
        W
      </Text>
    </>
  );
}

/* =========================================================
   MAIN RADAR SCENE
   ========================================================= */

function RadarScene({
   targets,
  selectedTrack,
  sweepAngle,
  onSelect,
}) {
  const sweepState =
    useRef(
      Number(sweepAngle) || 0
    );

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[
          14,
          11,
          16,
        ]}
        fov={48}
      />

      <color
        attach="background"
        args={[
          "#010806",
        ]}
      />

      <fog
        attach="fog"
        args={[
          "#010806",
          14,
          32,
        ]}
      />

      {/* Neutral cinematic illumination for the terrain */}
      <ambientLight
        intensity={0.58}
      />

      {/* Warm key light — reveals earth and rock colors */}
      <directionalLight
        position={[
          6,
          14,
          5,
        ]}
        intensity={1.05}
        color="#fff4df"
      />

      {/* Cool fill — keeps shadowed mountain faces readable */}
      <directionalLight
        position={[
          -8,
          9,
          -6,
        ]}
        intensity={0.48}
        color="#b8c5d0"
      />

      <Grid
        position={[
          0,
          -0.11,
          0,
        ]}
        args={[
          40,
          40,
        ]}
        cellSize={1}
        cellThickness={0.45}
        cellColor="#0a4d3c"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#11745a"
        fadeDistance={35}
        fadeStrength={1.4}
        infiniteGrid
      />

      <TerrainLandscape />

      <RangeRings />

      <Radials />

      <RadarDome />

      <AltitudeContours />

      <RadarSweep
        sweepAngle={
          sweepAngle
        }
        sweepState={
          sweepState
        }
      />

      <RadarOrigin />

      <Targets targets={targets}selectedTrack={selectedTrack}sweepState={sweepState}onSelect={onSelect}/>

      <CardinalLabels />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={12}
        maxDistance={25}
        minPolarAngle={0.55}
        maxPolarAngle={1.35}
        target={[
          0,
          2.8,
          0,
        ]}
      />
    </>
  );
}

/* =========================================================
   PUBLIC RADAR COMPONENT
   ========================================================= */

export default function Radar3D({
  targets = [],
  selectedTrack = null,
  sweepAngle = 0,
  onSelect,
}) {
  return (
    <div
      style={{
        position:
          "absolute",
        inset: 0,
      }}
    >
      <Canvas
        dpr={[
          1,
          1.7,
        ]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference:
            "high-performance",
        }}
      >
      <RadarScene targets={targets} selectedTrack={selectedTrack} sweepAngle={sweepAngle} onSelect={onSelect}/>
      </Canvas>
    </div>
  );
}