from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# =========================================================
# PRJ-17 Radar System - ML API
# =========================================================

app = FastAPI(
    title="PRJ-17 Radar ML API",
    version="1.0.0",
    description="Real-time UAV classification service"
)


# =========================================================
# MODEL PATH
# =========================================================

# app.py is inside:
# ml/api/app.py
#
# Therefore parent.parent = ml/

BASE = Path(__file__).resolve().parent.parent

MODEL_PATH = BASE / "model" / "uav_classifier.pkl"


# =========================================================
# GLOBAL MODEL VARIABLES
# =========================================================

model = None

FEATURES = [
    "range",
    "az",
    "el",
    "rcs",
    "rv",
    "vn",
    "ve",
    "vd",
    "speed_mps",
    "horizontal_speed_mps",
    "inliers",
    "duration"
]


# =========================================================
# LOAD MODEL
# =========================================================

def load_model():

    global model
    global FEATURES

    if not MODEL_PATH.exists():

        raise FileNotFoundError(
            f"Model not found at: {MODEL_PATH}"
        )

    bundle = joblib.load(MODEL_PATH)

    # Our trained model was saved as:
    #
    # {
    #     "model": trained_model,
    #     "features": [...]
    # }

    if isinstance(bundle, dict):

        model = bundle["model"]

        if "features" in bundle:

            FEATURES = bundle["features"]

    else:

        # Compatibility if the pickle contains
        # only the Random Forest model.

        model = bundle


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
        "model_path": str(MODEL_PATH),
        "features": FEATURES
    }


# =========================================================
# RADAR INPUT MODEL
# =========================================================

class RadarObservation(BaseModel):

    range: float = Field(
        ...,
        description="Target range in metres"
    )

    az: float = Field(
        ...,
        description="Azimuth in degrees"
    )

    el: float = Field(
        ...,
        description="Elevation in degrees"
    )

    rcs: float = Field(
        ...,
        description="Radar cross section in dBsm"
    )

    rv: float = Field(
        ...,
        description="Radial velocity in m/s"
    )

    vn: float = Field(
        ...,
        description="North velocity in m/s"
    )

    ve: float = Field(
        ...,
        description="East velocity in m/s"
    )

    vd: float = Field(
        ...,
        description="Down velocity in m/s"
    )

    speed_mps: float = Field(
        ...,
        description="3D speed in m/s"
    )

    horizontal_speed_mps: float = Field(
        ...,
        description="Horizontal speed in m/s"
    )

    inliers: float = Field(
        ...,
        description="Track inlier count"
    )

    duration: float = Field(
        ...,
        description="Track duration in seconds"
    )


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

    # Convert incoming JSON into DataFrame

    data = observation.model_dump()

    row = pd.DataFrame(
        [data],
        columns=FEATURES
    )

    # Get probability of UAV

    probability = float(
        model.predict_proba(row)[0][1]
    )

    # Classification threshold

    is_uav = probability >= 0.50

    # Confidence means confidence in the selected class

    if is_uav:

        confidence = probability

        classification = "UAV"

    else:

        confidence = 1.0 - probability

        classification = "NON-UAV"

    return {

        "classification": classification,

        "confidence": round(
            confidence,
            4
        ),

        "uav_probability": round(
            probability,
            4
        ),

        "estimated_rcs": observation.rcs,

        "range_m": observation.range,

        "radial_velocity_mps":
            observation.rv
    }


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

    # Convert all observations into DataFrame

    data = [
        observation.model_dump()
        for observation in observations
    ]

    frame = pd.DataFrame(
        data,
        columns=FEATURES
    )

    # Predict all targets at once

    probabilities = model.predict_proba(
        frame
    )[:, 1]

    results = []

    for observation, probability in zip(
        observations,
        probabilities
    ):

        probability = float(
            probability
        )

        is_uav = probability >= 0.50

        if is_uav:

            classification = "UAV"
            confidence = probability

        else:

            classification = "NON-UAV"
            confidence = 1.0 - probability

        results.append({

            "classification":
                classification,

            "confidence":
                round(
                    confidence,
                    4
                ),

            "uav_probability":
                round(
                    probability,
                    4
                ),

            "estimated_rcs":
                observation.rcs,

            "range_m":
                observation.range,

            "radial_velocity_mps":
                observation.rv
        })

    return {
        "results": results
    }