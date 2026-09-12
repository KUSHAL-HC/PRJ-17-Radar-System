import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  getDEMData,
  sampleElevation,
  TERRAIN_SIZE,
} from "./dem";

const GRID_SIZE = 128;
const VERTICAL_EXAGGERATION = 0.045;
const TREE_COUNT = 900;
const RIDGE_COUNT = 24;
const RADAR_CLEAR_RADIUS = 1.5;

function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value =
      (value * 1664525 + 1013904223) >>> 0;

    return value / 4294967296;
  };
}

/* =========================================================
   TERRAIN
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

  let min = Infinity;
  let max = -Infinity;

  /*
   * PlaneGeometry is XY.
   *
   * We rotate it -90° around X:
   *
   * world X = local X
   * world Y = local Z
   * world Z = -local Y
   *
   * Therefore we sample using:
   * x = local X
   * z = -local Y
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

    min =
      Math.min(
        min,
        relative
      );

    max =
      Math.max(
        max,
        relative
      );

    positions.setZ(
      i,
      relative *
        VERTICAL_EXAGGERATION
    );
  }

  /*
   * Stronger but still dark
   * natural terrain shading.
   */
  const colors =
    new Float32Array(
      positions.count * 3
    );

  const range =
    Math.max(
      1,
      max - min
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
          min
        ) / range,
        0,
        1
      );

    /*
     * Cinematic natural landscape palette.
     *
     * Low valley  -> dark earth / olive
     * Mid terrain -> muted forest green
     * High terrain -> charcoal rock
     *
     * Radar graphics remain cyan separately.
     */
    const lowR = 0.055;
    const lowG = 0.065;
    const lowB = 0.045;

    const midR = 0.055;
    const midG = 0.115;
    const midB = 0.070;

    const highR = 0.16;
    const highG = 0.17;
    const highB = 0.15;

    let r;
    let g;
    let b;

    if (n < 0.55) {
      const t = n / 0.55;

      r =
        lowR +
        (midR - lowR) * t;

      g =
        lowG +
        (midG - lowG) * t;

      b =
        lowB +
        (midB - lowB) * t;
    } else {
      const t =
        (n - 0.55) / 0.45;

      r =
        midR +
        (highR - midR) * t;

      g =
        midG +
        (highG - midG) * t;

      b =
        midB +
        (highB - midB) * t;
    }

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
    centerElevation,
    minElevation: min,
    maxElevation: max,
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
        seededRandom(1727);

      const result = [];

      let attempts = 0;

      while (
        result.length <
          TREE_COUNT &&
        attempts <
          TREE_COUNT * 8
      ) {
        attempts++;

        const angle =
          random() *
          Math.PI *
          2;

        const radius =
          1.0 +
          Math.sqrt(
            random()
          ) *
            9.3;

        const x =
          Math.cos(angle) *
          radius;

        const z =
          Math.sin(angle) *
          radius;

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

        const y =
          (
            elevation -
            centerElevation
          ) *
            VERTICAL_EXAGGERATION;

        /*
         * Avoid putting trees on
         * the highest exposed ridges.
         */
        const relative =
          elevation -
          centerElevation;

        if (
          relative >
          16
        ) {
          continue;
        }

        const height =
          0.20 +
          random() *
            0.52;

        const width =
          0.42 +
          random() *
            0.42;

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
          0.028,
          0.045,
          0.45,
          5
        ),
      []
    );

  const crownGeometry =
    useMemo(
      () =>
        new THREE.ConeGeometry(
          0.22,
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
            "#17271d",
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
            "#0a422d",
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
        (tree, i) => {
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
            i,
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
        (tree, i) => {
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
            i,
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
   MOUNTAIN RIDGES
   ========================================================= */

function MountainRidges({
  dem,
  centerElevation,
}) {
  const mountains =
    useMemo(() => {
      const random =
        seededRandom(9917);

      const result = [];

      for (
        let i = 0;
        i < RIDGE_COUNT;
        i++
      ) {
        const angle =
          (
            i /
              RIDGE_COUNT
          ) *
            Math.PI *
            2 +
          (
            random() -
            0.5
          ) *
            0.24;

        const radius =
          7.0 +
          random() *
            3.2;

        const x =
          Math.cos(angle) *
          radius;

        const z =
          Math.sin(angle) *
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
            VERTICAL_EXAGGERATION;

        /*
         * These are visual ridge masses
         * anchored directly to the DEM.
         */
        const height =
          1.0 +
          random() *
            1.9;

        const width =
          1.25 +
          random() *
            1.55;

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

  return (
    <group>
      {mountains.map(
        (
          mountain,
          index
        ) => (
          <group
            key={index}
            position={[
              mountain.x,
              mountain.y,
              mountain.z,
            ]}
            rotation={[
              0,
              mountain.rotation,
              0,
            ]}
          >
            <mesh
              position={[
                0,
                mountain.height *
                  0.34,
                0,
              ]}
              scale={[
                mountain.width,
                1,
                mountain.width *
                  0.72,
              ]}
            >
              <coneGeometry
                args={[
                  1,
                  mountain.height,
                  9,
                  3,
                ]}
              />

              <meshStandardMaterial
                color="#30342f"
                roughness={1}
                metalness={0}
                flatShading
              />
            </mesh>

            <mesh
              position={[
                mountain.width *
                  0.42,
                mountain.height *
                  0.22,
                mountain.width *
                  0.12,
              ]}
              scale={[
                mountain.width *
                  0.65,
                0.72,
                mountain.width *
                  0.52,
              ]}
            >
              <coneGeometry
                args={[
                  0.85,
                  mountain.height *
                    0.72,
                  8,
                  2,
                ]}
              />

              <meshStandardMaterial
                color="#242824"
                roughness={1}
                metalness={0}
                flatShading
              />
            </mesh>
          </group>
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
          "PRJ-17 DEM terrain failed:",
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
      {/* Real DEM ground */}
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

      {/* Natural forest */}
      <Forest
        dem={terrainData}
        centerElevation={
          centerElevation
        }
      />

      {/* Surrounding ridges */}
      <MountainRidges
        dem={terrainData}
        centerElevation={
          centerElevation
        }
      />

      {/* Dark terrain perimeter */}
      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.24,
          0,
        ]}
      >
        <planeGeometry
          args={[
            TERRAIN_SIZE * 1.65,
            TERRAIN_SIZE * 1.65,
          ]}
        />

        <meshStandardMaterial
          color="#070907"
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
