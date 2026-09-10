from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# =========================================================
# PRJ-17 Radar System - Production ML API
# =========================================================

app = FastAPI(
    title="PRJ-17 Radar ML API",
    version="2.0.0",
    description="Real-time UAV classification service"
)


# =========================================================
# MODEL CONFIGURATION
# =========================================================

BASE = Path(__file__).resolve().parent.parent

MODEL_PATH = BASE / "model" / "rf_uav_final.joblib"

SAMPLE_THRESHOLD = 0.15
PERSISTENCE_THRESHOLD = 0.50


# Exact feature order used during final model training
FEATURES = [
    "range_m",
    "azimuth_deg",
    "elevation_deg",
    "rcs_dbsm",
    "radial_velocity_mps",
    "velocity_n_mps",
    "velocity_e_mps",
    "velocity_d_mps"
]


# =========================================================
# GLOBAL MODEL
# =========================================================

model = None


# =========================================================
# LOAD MODEL
# =========================================================

def load_model():

    global model

    if not MODEL_PATH.exists():

        raise FileNotFoundError(
            f"Production model not found at: {MODEL_PATH}"
        )

    bundle = joblib.load(MODEL_PATH)

    if not isinstance(bundle, dict):

        raise ValueError(
            "Invalid model bundle. Expected dictionary."
        )

    model = bundle["model"]

    # Verify the saved model's feature configuration
    saved_features = bundle.get("features", FEATURES)

    if saved_features != FEATURES:

        raise ValueError(
            "Model feature configuration does not match "
            "the production API feature configuration."
        )


# =========================================================
# STARTUP
# =========================================================

@app.on_event("startup")
def startup_event():

    load_model()

    print("----------------------------------------")
    print("PRJ-17 ML API")
    print("----------------------------------------")
    print(f"Model: {MODEL_PATH}")
    print(f"Features: {FEATURES}")
    print(f"Sample threshold: {SAMPLE_THRESHOLD}")
    print(f"Persistence threshold: {PERSISTENCE_THRESHOLD}")
    print("Model loaded successfully")
    print("----------------------------------------")


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "prj17-ml",
        "model_loaded": model is not None,
        "model_type": "RandomForestClassifier",
        "model_version": "2.0.0",
        "features": FEATURES,
        "sample_threshold": SAMPLE_THRESHOLD,
        "persistence_threshold": PERSISTENCE_THRESHOLD
    }


# =========================================================
# RADAR INPUT
# =========================================================

class RadarObservation(BaseModel):

    range_m: float = Field(
        ...,
        description="Target range in metres"
    )

    azimuth_deg: float = Field(
        ...,
        description="Target azimuth in degrees"
    )

    elevation_deg: float = Field(
        ...,
        description="Target elevation in degrees"
    )

    rcs_dbsm: float = Field(
        ...,
        description="Radar cross section in dBsm"
    )

    radial_velocity_mps: float = Field(
        ...,
        description="Radial velocity in metres per second"
    )

    velocity_n_mps: float = Field(
        ...,
        description="North velocity in metres per second"
    )

    velocity_e_mps: float = Field(
        ...,
        description="East velocity in metres per second"
    )

    velocity_d_mps: float = Field(
        ...,
        description="Down velocity in metres per second"
    )


# =========================================================
# PREDICTION HELPER
# =========================================================

def make_prediction(observation: RadarObservation):

    data = observation.model_dump()

    row = pd.DataFrame(
        [data],
        columns=FEATURES
    )

    probability = float(
        model.predict_proba(row)[0][1]
    )

    is_uav = probability >= SAMPLE_THRESHOLD

    if is_uav:

        classification = "UAV"
        confidence = probability

    else:

        classification = "NON-UAV"
        confidence = 1.0 - probability

    return {
        "classification": classification,
        "confidence": round(confidence, 4),
        "uav_probability": round(probability, 4),

        "range_m": observation.range_m,
        "azimuth_deg": observation.azimuth_deg,
        "elevation_deg": observation.elevation_deg,
        "rcs_dbsm": observation.rcs_dbsm,
        "radial_velocity_mps": observation.radial_velocity_mps
    }


# =========================================================
# SINGLE TARGET PREDICTION
# =========================================================

@app.post("/predict")
def predict(observation: RadarObservation):

    if model is None:

        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded"
        )

    return make_prediction(observation)


# =========================================================
# BATCH PREDICTION
# =========================================================

@app.post("/predict/batch")
def predict_batch(
    observations: list[RadarObservation]
):

    if model is None:

        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded"
        )

    if not observations:

        return {
            "results": []
        }

    data = [
        observation.model_dump()
        for observation in observations
    ]

    frame = pd.DataFrame(
        data,
        columns=FEATURES
    )

    probabilities = model.predict_proba(
        frame
    )[:, 1]

    results = []

    for observation, probability in zip(
        observations,
        probabilities
    ):

        probability = float(probability)

        is_uav = probability >= SAMPLE_THRESHOLD

        if is_uav:

            classification = "UAV"
            confidence = probability

        else:

            classification = "NON-UAV"
            confidence = 1.0 - probability

        results.append({

            "classification": classification,

            "confidence": round(
                confidence,
                4
            ),

            "uav_probability": round(
                probability,
                4
            ),

            "range_m": observation.range_m,
            "azimuth_deg": observation.azimuth_deg,
            "elevation_deg": observation.elevation_deg,
            "rcs_dbsm": observation.rcs_dbsm,
            "radial_velocity_mps":
                observation.radial_velocity_mps
        })

    return {
        "results": results
    }
