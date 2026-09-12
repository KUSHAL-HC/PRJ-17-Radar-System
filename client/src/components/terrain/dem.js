const DEM_URL = "/terrain/radar-dem.png";

const DEM_SIZE = 256;
const TERRAIN_SIZE = 24;

let demData = null;
let demPromise = null;

function decodeTerrarium(r, g, b) {
  return (
    r * 256 +
    g +
    b / 256 -
    32768
  );
}

async function loadDEM() {
  if (demData) {
    return demData;
  }

  if (demPromise) {
    return demPromise;
  }

  demPromise = new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.onload = () => {
        try {
          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            image.width;

          canvas.height =
            image.height;

          const context =
            canvas.getContext(
              "2d",
              {
                willReadFrequently:
                  true,
              }
            );

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

          const elevations =
            new Float32Array(
              image.width *
                image.height
            );

          for (
            let y = 0;
            y < image.height;
            y++
          ) {
            for (
              let x = 0;
              x < image.width;
              x++
            ) {
              const pixel =
                (
                  y *
                    image.width +
                  x
                ) *
                4;

              elevations[
                y *
                  image.width +
                  x
              ] =
                decodeTerrarium(
                  imageData.data[
                    pixel
                  ],
                  imageData.data[
                    pixel + 1
                  ],
                  imageData.data[
                    pixel + 2
                  ]
                );
            }
          }

          demData = {
            width:
              image.width,

            height:
              image.height,

            elevations,

            terrainSize:
              TERRAIN_SIZE,
          };

          console.log(
            "PRJ-17 DEM loaded:",
            {
              width:
                image.width,

              height:
                image.height,

              terrainSize:
                TERRAIN_SIZE,
            }
          );

          resolve(
            demData
          );
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(
          new Error(
            "Unable to load PRJ-17 DEM: " +
              DEM_URL
          )
        );
      };

      image.src =
        DEM_URL;
    }
  );

  return demPromise;
}

/*
 * Convert Three.js terrain coordinates
 * into normalized DEM coordinates.
 *
 * x:
 *   -TERRAIN_SIZE/2 → left edge
 *   +TERRAIN_SIZE/2 → right edge
 *
 * z:
 *   -TERRAIN_SIZE/2 → north
 *   +TERRAIN_SIZE/2 → south
 */
function worldToDEM(x, z) {
  const half =
    TERRAIN_SIZE / 2;

  const u =
    THREEClamp(
      (x + half) /
        TERRAIN_SIZE,
      0,
      1
    );

  const v =
    THREEClamp(
      (z + half) /
        TERRAIN_SIZE,
      0,
      1
    );

  return {
    u,
    v,
  };
}

function THREEClamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

/*
 * Bilinear interpolation.
 *
 * This is important because trees
 * and radar equipment should not
 * snap to individual DEM pixels.
 */
function sampleElevation(
  data,
  x,
  z
) {
  const {
    width,
    height,
    elevations,
  } = data;

  const { u, v } =
    worldToDEM(x, z);

  const px =
    u * (width - 1);

  const py =
    (1 - v) *
    (height - 1);

  const x0 =
    Math.floor(px);

  const y0 =
    Math.floor(py);

  const x1 =
    Math.min(
      x0 + 1,
      width - 1
    );

  const y1 =
    Math.min(
      y0 + 1,
      height - 1
    );

  const tx =
    px - x0;

  const ty =
    py - y0;

  const e00 =
    elevations[
      y0 * width + x0
    ];

  const e10 =
    elevations[
      y0 * width + x1
    ];

  const e01 =
    elevations[
      y1 * width + x0
    ];

  const e11 =
    elevations[
      y1 * width + x1
    ];

  const top =
    e00 +
    (e10 - e00) * tx;

  const bottom =
    e01 +
    (e11 - e01) * tx;

  return (
    top +
    (bottom - top) * ty
  );
}

/*
 * Get elevation at a Three.js
 * world coordinate.
 *
 * Returned value is in REAL meters.
 */
export async function getElevation(
  x,
  z
) {
  const data =
    await loadDEM();

  return sampleElevation(
    data,
    x,
    z
  );
}

/*
 * Load the DEM explicitly.
 */
export async function loadTerrainDEM() {
  return loadDEM();
}

/*
 * Get the complete elevation
 * dataset for terrain generation.
 */
export async function getDEMData() {
  return loadDEM();
}

/*
 * Radar site reference elevation.
 *
 * The center of our terrain
 * corresponds to the radar site.
 */
export async function getRadarElevation() {
  return getElevation(
    0,
    0
  );
}

export {
  DEM_SIZE,
  TERRAIN_SIZE,
  sampleElevation,
};
