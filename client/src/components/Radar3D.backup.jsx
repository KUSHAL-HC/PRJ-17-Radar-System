import { useEffect, useMemo, useRef, useState } from "react";
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
function ForestAndMountains() {
  const forest = useMemo(() => {
    const trees = [];

    /*
     * Deterministic pseudo-random generator.
     * This keeps the landscape stable between
     * React renders.
     */
    let seed = 17;

    const random = () => {
      seed =
        (seed * 9301 + 49297) %
        233280;

      return seed / 233280;
    };

    /*
     * Forest occupies the central valley.
     *
     * Keep the immediate radar installation
     * area relatively clear.
     */
    for (let i = 0; i < 420; i++) {
      const angle =
        random() *
        Math.PI *
        2;

      const radius =
        1.2 +
        Math.sqrt(random()) *
          6.4;

      const x =
        Math.cos(angle) *
        radius;

      const z =
        Math.sin(angle) *
        radius;

      /*
       * Leave a clear circular area
       * around the radar.
       */
      if (
        Math.sqrt(
          x * x + z * z
        ) < 1.45
      ) {
        continue;
      }

      const height =
        0.45 +
        random() *
          0.75;

      const width =
        0.75 +
        random() *
          0.45;

      trees.push({
        x,
        z,
        height,
        width,
        rotation:
          random() *
          Math.PI *
          2,
      });
    }

    return trees;
  }, []);

  const mountainPositions =
    useMemo(() => {
      const mountains = [];

      let seed = 91;

      const random = () => {
        seed =
          (seed * 9301 +
            49297) %
          233280;

        return seed / 233280;
      };

      /*
       * Large mountains surrounding
       * the forest valley.
       */
      for (
        let i = 0;
        i < 14;
        i++
      ) {
        const angle =
          (i / 14) *
            Math.PI *
            2 +
          (random() -
            0.5) *
            0.16;

        const radius =
          9.0 +
          random() *
            2.0;

        mountains.push({
          x:
            Math.cos(angle) *
            radius,

          z:
            Math.sin(angle) *
            radius,

          height:
            2.0 +
            random() *
              2.2,

          radius:
            1.5 +
            random() *
              1.2,

          rotation:
            random() *
            Math.PI *
            2,
        });
      }

      return mountains;
    }, []);

  /*
   * Instanced tree geometry.
   */
  const treeTrunk =
    useMemo(
      () =>
        new THREE.CylinderGeometry(
          0.045,
          0.07,
          0.55,
          5
        ),
      []
    );

  const treeCrown =
    useMemo(
      () =>
        new THREE.ConeGeometry(
          0.32,
          0.9,
          7
        ),
      []
    );

  const treeTrunkMaterial =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color:
            "#17251d",
          roughness: 1,
          metalness: 0,
        }),
      []
    );

  const treeCrownMaterial =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color:
            "#0b3f2d",
          roughness: 1,
          metalness: 0,
        }),
      []
    );

  /*
   * Mountain material.
   */
  const mountainMaterial =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color:
            "#102b22",
          roughness: 1,
          metalness: 0,
          flatShading: true,
        }),
      []
    );

  /*
   * Tree instancing.
   */
  const trunkMesh =
    useMemo(() => {
      const mesh =
        new THREE.InstancedMesh(
          treeTrunk,
          treeTrunkMaterial,
          forest.length
        );

      const dummy =
        new THREE.Object3D();

      forest.forEach(
        (tree, index) => {
          dummy.position.set(
            tree.x,
            tree.height *
              0.275,
            tree.z
          );

          dummy.rotation.y =
            tree.rotation;

          dummy.scale.set(
            tree.width,
            tree.height,
            tree.width
          );

          dummy.updateMatrix();

          mesh.setMatrixAt(
            index,
            dummy.matrix
          );
        }
      );

      mesh.instanceMatrix.needsUpdate =
        true;

      return mesh;
    }, [
      forest,
      treeTrunk,
      treeTrunkMaterial,
    ]);

  const crownMesh =
    useMemo(() => {
      const mesh =
        new THREE.InstancedMesh(
          treeCrown,
          treeCrownMaterial,
          forest.length
        );

      const dummy =
        new THREE.Object3D();

      forest.forEach(
        (tree, index) => {
          dummy.position.set(
            tree.x,
            tree.height *
              0.72,
            tree.z
          );

          dummy.rotation.y =
            tree.rotation;

          dummy.scale.set(
            tree.width,
            tree.height,
            tree.width
          );

          dummy.updateMatrix();

          mesh.setMatrixAt(
            index,
            dummy.matrix
          );
        }
      );

      mesh.instanceMatrix.needsUpdate =
        true;

      return mesh;
    }, [
      forest,
      treeCrown,
      treeCrownMaterial,
    ]);

  return (
    <group>
      {/* =====================================
          FOREST
          ===================================== */}

      <primitive
        object={trunkMesh}
      />

      <primitive
        object={crownMesh}
      />

      {/* =====================================
          MOUNTAIN RING
          ===================================== */}

      {mountainPositions.map(
        (mountain, index) => (
          <group
            key={index}
            position={[
              mountain.x,
              mountain.height /
                2 -
                0.05,
              mountain.z,
            ]}
            rotation={[
              0,
              mountain.rotation,
              0,
            ]}
          >
            {/* Main mountain body */}
            <mesh>
              <coneGeometry
                args={[
                  mountain.radius,
                  mountain.height,
                  7,
                  3,
                ]}
              />

              <primitive
                object={
                  mountainMaterial
                }
              />
            </mesh>

            {/* Secondary ridge */}
            <mesh
              position={[
                0.45,
                0.25,
                0.2,
              ]}
              scale={[
                0.55,
                0.7,
                0.65,
              ]}
            >
              <coneGeometry
                args={[
                  mountain.radius,
                  mountain.height *
                    0.7,
                  6,
                  2,
                ]}
              />

              <primitive
                object={
                  mountainMaterial
                }
              />
            </mesh>
          </group>
        )
      )}
    </group>
  );
}

function Terrain() {
  const [terrainGeometry, setTerrainGeometry] =
    useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadTerrain = async () => {
      const image = new Image();

      image.src = "/terrain/radar-dem.png";

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      if (cancelled) return;

      const canvas =
        document.createElement("canvas");

      canvas.width = image.width;
      canvas.height = image.height;

      const context =
        canvas.getContext("2d", {
          willReadFrequently: true,
        });

      context.drawImage(
        image,
        0,
        0
      );

      const imageData =
        context.getImageData(
          0,
          0,
          image.width,
          image.height
        );

      const decodeElevation = (
        pixelIndex
      ) => {
        const r =
          imageData.data[pixelIndex];

        const g =
          imageData.data[
            pixelIndex + 1
          ];

        const b =
          imageData.data[
            pixelIndex + 2
          ];

        return (
          r * 256 +
          g +
          b / 256 -
          32768
        );
      };

      /*
       * 128 × 128 real DEM samples.
       */

      const sampleSize = 128;

      const startX =
        Math.floor(
          (image.width -
            sampleSize) /
            2
        );

      const startY =
        Math.floor(
          (image.height -
            sampleSize) /
            2
        );

      const terrainSize = 24;

      const geometry =
        new THREE.PlaneGeometry(
          terrainSize,
          terrainSize,
          sampleSize - 1,
          sampleSize - 1
        );

      const positions =
        geometry.attributes.position;

      /*
       * Radar site elevation.
       */

      const centerX =
        startX +
        Math.floor(
          sampleSize / 2
        );

      const centerY =
        startY +
        Math.floor(
          sampleSize / 2
        );

      const centerIndex =
        (
          centerY *
            image.width +
          centerX
        ) *
        4;

      const radarElevation =
        decodeElevation(
          centerIndex
        );

      /*
       * Vertical exaggeration.
       *
       * Still real DEM elevation,
       * only visually amplified.
       */

      const verticalScale = 0.035;

      const elevations =
        new Float32Array(
          positions.count
        );

      let minElevation =
        Infinity;

      let maxElevation =
        -Infinity;

      /*
       * Read real elevations.
       */

      for (
        let i = 0;
        i < positions.count;
        i++
      ) {
        const gridX =
          i %
          sampleSize;

        const gridY =
          Math.floor(
            i / sampleSize
          );

        const pixelX =
          startX + gridX;

        const pixelY =
          startY +
          (
            sampleSize -
            1 -
            gridY
          );

        const pixelIndex =
          (
            pixelY *
              image.width +
            pixelX
          ) *
          4;

        const elevation =
          decodeElevation(
            pixelIndex
          );

        const relativeElevation =
          elevation -
          radarElevation;

        elevations[i] =
          relativeElevation;

        minElevation =
          Math.min(
            minElevation,
            relativeElevation
          );

        maxElevation =
          Math.max(
            maxElevation,
            relativeElevation
          );
      }

      /*
       * Apply actual terrain height.
       */

      for (
        let i = 0;
        i < positions.count;
        i++
      ) {
        positions.setZ(
          i,
          elevations[i] *
            verticalScale
        );
      }

      /*
       * Create elevation-based
       * vertex colors.
       */

      const colors =
        new Float32Array(
          positions.count * 3
        );

      const elevationRange =
        Math.max(
          1,
          maxElevation -
            minElevation
        );

      for (
        let i = 0;
        i < positions.count;
        i++
      ) {
        const normalized =
          THREE.MathUtils.clamp(
            (
              elevations[i] -
              minElevation
            ) /
              elevationRange,
            0,
            1
          );

        /*
         * Dark tactical landscape:
         *
         * low elevation → deep green
         * high elevation → muted green
         */

        const r =
          0.018 +
          normalized * 0.035;

        const g =
          0.075 +
          normalized * 0.105;

        const b =
          0.055 +
          normalized * 0.055;

        colors[i * 3] =
          r;

        colors[i * 3 + 1] =
          g;

        colors[i * 3 + 2] =
          b;
      }

      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          colors,
          3
        )
      );

      geometry.computeVertexNormals();

      geometry.userData = {
        radarElevation,
        minElevation,
        maxElevation,
      };

      if (!cancelled) {
        setTerrainGeometry(
          geometry
        );
      } else {
        geometry.dispose();
      }
    };

    loadTerrain().catch(
      (error) => {
        console.error(
          "PRJ-17 terrain loading failed:",
          error
        );
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (!terrainGeometry) {
    return null;
  }

  return (
    <group>

      {/* =====================================
          REAL LANDSCAPE SURFACE
          ===================================== */}

      <mesh
        geometry={
          terrainGeometry
        }
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.08,
          0,
        ]}
      >
        <meshStandardMaterial
          vertexColors
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* =====================================
          SUBTLE TERRAIN STRUCTURE
          ===================================== */}

      <mesh
        geometry={
          terrainGeometry
        }
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.055,
          0,
        ]}
        scale={[
          1.002,
          1.002,
          1.002,
        ]}
      >
        <meshBasicMaterial
          color="#1c7558"
          wireframe
          transparent
          opacity={0.12}
        />
      </mesh>

    </group>
  );
}

/* =========================================================
   RADAR SWEEP
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

    sweepRef.current.rotation.y +=
      delta * 0.75;

    const worldRotation =
      sweepRef.current.rotation.y;

    const degrees =
      THREE.MathUtils.radToDeg(
        worldRotation
      );

    sweepState.current =
      normalizeAngle(
        -degrees
      );
  });

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
        0.12,
        0,
      ]}
    >
      {/* Wide detection wedge */}
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
            32,
            0,
            Math.PI / 9,
          ]}
        />

        <meshBasicMaterial
          color="#2affbd"
          transparent
          opacity={0.055}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={
            THREE.AdditiveBlending
          }
        />
      </mesh>

      {/* Secondary fading wedge */}
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
            32,
            0,
            Math.PI / 20,
          ]}
        />

        <meshBasicMaterial
          color="#7affdc"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={
            THREE.AdditiveBlending
          }
        />
      </mesh>

      {/* Main sweep line */}
      <mesh
        position={[
          0,
          0,
          -5,
        ]}
      >
        <boxGeometry
          args={[
            0.025,
            0.025,
            10,
          ]}
        />

        <meshBasicMaterial
          color="#8affdf"
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Sweep origin glow */}
      <mesh>
        <sphereGeometry
          args={[
            0.07,
            12,
            12,
          ]}
        />

        <meshBasicMaterial
          color="#9ffff0"
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
  const geometry =
    useMemo(() => {
      const positions =
        new Float32Array(
          MAX_TRAIL_POINTS * 3
        );

      const geo =
        new THREE.BufferGeometry();

      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          positions,
          3
        )
      );

      geo.setDrawRange(
        0,
        0
      );

      return geo;
    }, []);

  useEffect(() => {
    lineRef.current =
      geometry;

    return () => {
      geometry.dispose();
    };
  }, [geometry, lineRef]);

  useFrame(() => {
    if (!geometry) {
      return;
    }

    const points =
      trailRef.current;

    if (
      !points ||
      points.length < 2
    ) {
      geometry.setDrawRange(
        0,
        0
      );

      return;
    }

    const attribute =
      geometry.attributes
        .position;

    const max =
      Math.min(
        points.length,
        MAX_TRAIL_POINTS
      );

    for (
      let i = 0;
      i < max;
      i++
    ) {
      const point =
        points[
          points.length -
            max +
            i
        ];

      attribute.setXYZ(
        i,
        point.x,
        point.y,
        point.z
      );
    }

    attribute.needsUpdate =
      true;

    geometry.setDrawRange(
      0,
      max
    );
  });

  return (
    <line
      geometry={geometry}
    >
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.28}
        depthWrite={false}
        blending={
          THREE.AdditiveBlending
        }
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

      <group ref={group}>
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
        <mesh ref={pulse}>
          <octahedronGeometry
            args={[
              selected
                ? 0.27
                : 0.17,
              1,
            ]}
          />

          <meshBasicMaterial
            color={color}
            wireframe={!selected}
            toneMapped={false}
          />
        </mesh>

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

      <ambientLight
        intensity={0.2}
      />

      <directionalLight
        position={[
          6,
          12,
          5,
        ]}
        intensity={0.3}
        color="#43e9bd"
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

      <Terrain />

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

      <Targets
        targets={targets}
        selectedTrack={
          selectedTrack
        }
        sweepState={
          sweepState
        }
      />

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
        <RadarScene
          targets={
            targets
          }
          selectedTrack={
            selectedTrack
          }
          sweepAngle={
            sweepAngle
          }
        />
      </Canvas>
    </div>
  );
}