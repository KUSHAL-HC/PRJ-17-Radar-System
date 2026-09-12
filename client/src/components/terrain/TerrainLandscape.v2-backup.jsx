import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  getDEMData,
  sampleElevation,
  TERRAIN_SIZE,
} from "./dem";

/* =========================================================
   PRJ-17 CINEMATIC TERRAIN ENGINE
   ========================================================= */

const GRID_SIZE = 128;

/*
 * Real DEM relief is retained, but exaggerated enough
 * to remain readable inside the radar visualization.
 */
const TERRAIN_VERTICAL_SCALE = 0.045;

/*
 * Forest.
 */
const TREE_COUNT = 1400;

/*
 * Large mountain/cliff formations.
 */
const NORTH_MOUNTAIN_COUNT = 15;
const SIDE_MOUNTAIN_COUNT = 18;

/*
 * Keep the radar installation clear.
 */
const RADAR_CLEAR_RADIUS = 1.35;

/* =========================================================
   DETERMINISTIC RANDOM
   ========================================================= */

function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value =
      (value * 1664525 + 1013904223) >>> 0;

    return value / 4294967296;
  };
}

/* =========================================================
   TERRAIN GEOMETRY
   ========================================================= */

function buildTerrain(data) {
  const geometry =
    new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      GRID_SIZE - 1,
      GRID_SIZE - 1
    );

  const positions =
    geometry.attributes.position;

  const centerElevation =
    sampleElevation(
      data,
      0,
      0
    );

  const elevations =
    new Float32Array(
      positions.count
    );

  let minElevation = Infinity;
  let maxElevation = -Infinity;

  /*
   * PlaneGeometry is initially XY.
   *
   * After rotation:
   *
   * X = east/west
   * Z = north/south
   * Y = elevation
   *
   * We therefore sample using z = -localY.
   */
  for (
    let i = 0;
    i < positions.count;
    i++
  ) {
    const x =
      positions.getX(i);

    const z =
      -positions.getY(i);

    const elevation =
      sampleElevation(
        data,
        x,
        z
      );

    const relative =
      elevation -
      centerElevation;

    elevations[i] =
      relative;

    minElevation =
      Math.min(
        minElevation,
        relative
      );

    maxElevation =
      Math.max(
        maxElevation,
        relative
      );

    positions.setZ(
      i,
      relative *
        TERRAIN_VERTICAL_SCALE
    );
  }

  /*
   * Natural cinematic elevation palette.
   *
   * Valley:
   *   dark earth / olive
   *
   * Forest:
   *   muted deep green
   *
   * High terrain:
   *   charcoal / gray rock
   */
  const colors =
    new Float32Array(
      positions.count * 3
    );

  const range =
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
    const n =
      THREE.MathUtils.clamp(
        (
          elevations[i] -
          minElevation
        ) /
          range,
        0,
        1
      );

    let r;
    let g;
    let b;

    if (n < 0.38) {
      /*
       * Valley / soil.
       */
      const t =
        n / 0.38;

      r =
        0.055 +
        t * 0.018;

      g =
        0.052 +
        t * 0.045;

      b =
        0.036 +
        t * 0.018;
    } else if (n < 0.72) {
      /*
       * Forest belt.
       */
      const t =
        (n - 0.38) /
        0.34;

      r =
        0.073 +
        t * 0.025;

      g =
        0.097 +
        t * 0.055;

      b =
        0.052 +
        t * 0.028;
    } else {
      /*
       * Exposed high terrain.
       */
      const t =
        (n - 0.72) /
        0.28;

      r =
        0.12 +
        t * 0.12;

      g =
        0.13 +
        t * 0.12;

      b =
        0.12 +
        t * 0.11;
    }

    colors[
      i * 3
    ] = r;

    colors[
      i * 3 + 1
    ] = g;

    colors[
      i * 3 + 2
    ] = b;
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
    centerElevation,
    minElevation,
    maxElevation,
  };

  return geometry;
}

/* =========================================================
   FOREST
   ========================================================= */

function Forest({
  dem,
  centerElevation,
}) {
  const trees =
    useMemo(() => {
      const random =
        seededRandom(17017);

      const result = [];

      let attempts = 0;

      while (
        result.length <
          TREE_COUNT &&
        attempts <
          TREE_COUNT * 7
      ) {
        attempts++;

        /*
         * Spread trees across the full
         * terrain instead of concentrating
         * them in one circular band.
         */
        const x =
          (
            random() -
            0.5
          ) *
          (
            TERRAIN_SIZE *
            0.92
          );

        const z =
          (
            random() -
            0.5
          ) *
          (
            TERRAIN_SIZE *
            0.92
          );

        if (
          Math.sqrt(
            x * x +
              z * z
          ) <
          RADAR_CLEAR_RADIUS
        ) {
          continue;
        }

        const elevation =
          sampleElevation(
            dem,
            x,
            z
          );

        const relative =
          elevation -
          centerElevation;

        /*
         * Keep highest exposed ridges
         * relatively clear so cliffs/mountains
         * remain visible.
         */
        if (
          relative >
          18
        ) {
          continue;
        }

        const y =
          relative *
          TERRAIN_VERTICAL_SCALE;

        const height =
          0.16 +
          random() *
            0.42;

        const width =
          0.35 +
          random() *
            0.38;

        result.push({
          x,
          y,
          z,
          height,
          width,
          rotation:
            random() *
            Math.PI *
            2,
        });
      }

      return result;
    }, [
      dem,
      centerElevation,
    ]);

  const trunkGeometry =
    useMemo(
      () =>
        new THREE.CylinderGeometry(
          0.025,
          0.042,
          0.42,
          5
        ),
      []
    );

  const crownGeometry =
    useMemo(
      () =>
        new THREE.ConeGeometry(
          0.20,
          0.62,
          7,
          1
        ),
      []
    );

  const trunkMaterial =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color:
            "#211f19",
          roughness: 1,
          metalness: 0,
        }),
      []
    );

  const crownMaterial =
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color:
            "#163d29",
          roughness: 1,
          metalness: 0,
        }),
      []
    );

  const trunks =
    useMemo(() => {
      const mesh =
        new THREE.InstancedMesh(
          trunkGeometry,
          trunkMaterial,
          trees.length
        );

      const dummy =
        new THREE.Object3D();

      trees.forEach(
        (tree, index) => {
          dummy.position.set(
            tree.x,
            tree.y +
              tree.height *
                0.20,
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
      trees,
      trunkGeometry,
      trunkMaterial,
    ]);

  const crowns =
    useMemo(() => {
      const mesh =
        new THREE.InstancedMesh(
          crownGeometry,
          crownMaterial,
          trees.length
        );

      const dummy =
        new THREE.Object3D();

      trees.forEach(
        (tree, index) => {
          dummy.position.set(
            tree.x,
            tree.y +
              tree.height *
                0.67,
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
      trees,
      crownGeometry,
      crownMaterial,
    ]);

  return (
    <group>
      <primitive
        object={trunks}
      />

      <primitive
        object={crowns}
      />
    </group>
  );
}

/* =========================================================
   MOUNTAIN FORM
   ========================================================= */

function Mountain({
  x,
  z,
  y,
  height,
  width,
  rotation,
  rock,
}) {
  return (
    <group
      position={[
        x,
        y,
        z,
      ]}
      rotation={[
        0,
        rotation,
        0,
      ]}
    >
      {/* Main mountain mass */}
      <mesh
        position={[
          0,
          height *
            0.38,
          0,
        ]}
        scale={[
          width,
          1,
          width *
            0.62,
        ]}
      >
        <coneGeometry
          args={[
            1,
            height,
            9,
            4,
          ]}
        />

        <meshStandardMaterial
          color={rock}
          roughness={0.95}
          metalness={0}
          flatShading
        />
      </mesh>

      {/* Secondary shoulder */}
      <mesh
        position={[
          width *
            0.48,
          height *
            0.20,
          width *
            0.10,
        ]}
        scale={[
          width *
            0.70,
          0.75,
          width *
            0.48,
        ]}
      >
        <coneGeometry
          args={[
            0.82,
            height *
              0.70,
            8,
            3,
          ]}
        />

        <meshStandardMaterial
          color="#30322e"
          roughness={1}
          metalness={0}
          flatShading
        />
      </mesh>

      {/* Dark cliff face */}
      <mesh
        position={[
          -width *
            0.28,
          height *
            0.30,
          width *
            0.40,
        ]}
        rotation={[
          0.18,
          0,
          -0.12,
        ]}
        scale={[
          width *
            0.32,
          height *
            0.48,
          0.10,
        ]}
      >
        <boxGeometry
          args={[
            1,
            1,
            1,
          ]}
        />

        <meshStandardMaterial
          color="#171916"
          roughness={1}
          metalness={0}
          flatShading
        />
      </mesh>
    </group>
  );
}

/* =========================================================
   MOUNTAIN RANGES
   ========================================================= */

function MountainRanges({
  dem,
  centerElevation,
}) {
  const mountains =
    useMemo(() => {
      const random =
        seededRandom(91017);

      const result = [];

      /*
       * NORTH RANGE
       *
       * This specifically fills the empty
       * northern horizon visible in the
       * current camera.
       */
      for (
        let i = 0;
        i < NORTH_MOUNTAIN_COUNT;
        i++
      ) {
        const x =
          -8.8 +
          i *
            1.25 +
          (
            random() -
            0.5
          ) *
            0.85;

        const z =
          -8.2 +
          (
            random() -
            0.5
          ) *
            2.0;

        const elevation =
          sampleElevation(
            dem,
            x,
            z
          );

        const y =
          (
            elevation -
            centerElevation
          ) *
            TERRAIN_VERTICAL_SCALE;

        result.push({
          x,
          z,
          y,
          height:
            1.5 +
            random() *
              2.5,
          width:
            1.0 +
            random() *
              1.25,
          rotation:
            random() *
            Math.PI,
          rock:
            random() >
            0.42
              ? "#353733"
              : "#292d29",
        });
      }

      /*
       * SIDE / BACK RIDGES
       */
      for (
        let i = 0;
        i < SIDE_MOUNTAIN_COUNT;
        i++
      ) {
        const angle =
          (
            i /
              SIDE_MOUNTAIN_COUNT
          ) *
            Math.PI *
            2 +
          (
            random() -
            0.5
          ) *
            0.30;

        const radius =
          8.0 +
          random() *
            3.0;

        const x =
          Math.sin(angle) *
          radius;

        const z =
          -Math.cos(angle) *
          radius;

        const elevation =
          sampleElevation(
            dem,
            x,
            z
          );

        const y =
          (
            elevation -
            centerElevation
          ) *
            TERRAIN_VERTICAL_SCALE;

        result.push({
          x,
          z,
          y,
          height:
            0.9 +
            random() *
              1.8,
          width:
            0.9 +
            random() *
              1.4,
          rotation:
            random() *
            Math.PI,
          rock:
            random() >
            0.45
              ? "#30332f"
              : "#242824",
        });
      }

      return result;
    }, [
      dem,
      centerElevation,
    ]);

  return (
    <group>
      {mountains.map(
        (
          mountain,
          index
        ) => (
          <Mountain
            key={index}
            {...mountain}
          />
        )
      )}
    </group>
  );
}

/* =========================================================
   LANDSCAPE
   ========================================================= */

export default function TerrainLandscape() {
  const [
    terrainData,
    setTerrainData,
  ] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getDEMData()
      .then((data) => {
        if (!cancelled) {
          setTerrainData(data);
        }
      })
      .catch((error) => {
        console.error(
          "PRJ-17 terrain engine failed:",
          error
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const terrainGeometry =
    useMemo(() => {
      if (!terrainData) {
        return null;
      }

      return buildTerrain(
        terrainData
      );
    }, [terrainData]);

  useEffect(() => {
    return () => {
      terrainGeometry?.dispose();
    };
  }, [terrainGeometry]);

  if (
    !terrainData ||
    !terrainGeometry
  ) {
    return null;
  }

  const centerElevation =
    terrainGeometry.userData
      .centerElevation;

  return (
    <group>
      {/* =================================================
          REAL DEM TERRAIN
          ================================================= */}

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
          -0.10,
          0,
        ]}
        receiveShadow
      >
        <meshStandardMaterial
          vertexColors
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* =================================================
          FOREST
          ================================================= */}

      <Forest
        dem={terrainData}
        centerElevation={
          centerElevation
        }
      />

      {/* =================================================
          MOUNTAIN / CLIFF RING
          ================================================= */}

      <MountainRanges
        dem={terrainData}
        centerElevation={
          centerElevation
        }
      />

      {/* =================================================
          DARK OUTER GROUND
          ================================================= */}

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.30,
          0,
        ]}
      >
        <planeGeometry
          args={[
            TERRAIN_SIZE *
              1.8,
            TERRAIN_SIZE *
              1.8,
          ]}
        />

        <meshStandardMaterial
          color="#060806"
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
