from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    confusion_matrix
)


# =========================================================
# PATHS
# =========================================================

BASE = Path(__file__).resolve().parent

DATA_PATH = BASE / "data" / "opt2_radar_ml_dataset.csv"

MODEL_DIR = BASE / "model"

MODEL_DIR.mkdir(
    exist_ok=True
)

MODEL_PATH = MODEL_DIR / "uav_classifier.pkl"

METRICS_PATH = MODEL_DIR / "validation_metrics.json"


# =========================================================
# FEATURES
# =========================================================

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
# LOAD DATASET
# =========================================================

print()
print("========================================")
print("PRJ-17 UAV CLASSIFIER TRAINING")
print("========================================")

print(f"Dataset: {DATA_PATH}")

df = pd.read_csv(DATA_PATH)

print(f"Total samples: {len(df)}")

X = (
    df[FEATURES]
    .replace([np.inf, -np.inf], np.nan)
    .fillna(0)
)

y = df["label"].astype(int)


# =========================================================
# CHRONOLOGICAL VALIDATION
# =========================================================

cutoff = df["time_s"].quantile(0.70)

train_mask = df["time_s"] <= cutoff

test_mask = df["time_s"] > cutoff

X_train = X.loc[train_mask]

X_test = X.loc[test_mask]

y_train = y.loc[train_mask]

y_test = y.loc[test_mask]


print()
print(f"Training samples: {len(X_train)}")
print(f"Testing samples:  {len(X_test)}")


# =========================================================
# VALIDATION MODEL
# =========================================================

validation_model = RandomForestClassifier(

    n_estimators=300,

    min_samples_leaf=2,

    class_weight="balanced_subsample",

    random_state=42,

    n_jobs=-1
)


print()
print("Training validation model...")

validation_model.fit(
    X_train,
    y_train
)


# =========================================================
# VALIDATION PREDICTION
# =========================================================

probabilities = validation_model.predict_proba(
    X_test
)[:, 1]

predictions = (
    probabilities >= 0.50
).astype(int)


# =========================================================
# METRICS
# =========================================================

metrics = {

    "accuracy":
        float(
            accuracy_score(
                y_test,
                predictions
            )
        ),

    "precision":
        float(
            precision_score(
                y_test,
                predictions,
                zero_division=0
            )
        ),

    "recall":
        float(
            recall_score(
                y_test,
                predictions,
                zero_division=0
            )
        ),

    "f1":
        float(
            f1_score(
                y_test,
                predictions,
                zero_division=0
            )
        ),

    "roc_auc":
        float(
            roc_auc_score(
                y_test,
                probabilities
            )
        ),

    "pr_auc":
        float(
            average_precision_score(
                y_test,
                probabilities
            )
        ),

    "confusion_matrix":
        confusion_matrix(
            y_test,
            predictions
        ).tolist(),

    "features":
        FEATURES,

    "samples":
        int(len(df)),

    "uav_samples":
        int((y == 1).sum()),

    "non_uav_samples":
        int((y == 0).sum())
}


print()
print("========================================")
print("VALIDATION RESULTS")
print("========================================")

for key, value in metrics.items():

    print(
        f"{key}: {value}"
    )


# =========================================================
# FINAL PRODUCTION MODEL
# =========================================================

print()
print("Training final production model...")


final_model = RandomForestClassifier(

    n_estimators=300,

    min_samples_leaf=2,

    class_weight="balanced_subsample",

    random_state=42,

    n_jobs=-1
)


final_model.fit(
    X,
    y
)


# =========================================================
# SAVE MODEL
# =========================================================

bundle = {

    "model":
        final_model,

    "features":
        FEATURES
}


joblib.dump(
    bundle,
    MODEL_PATH
)


# =========================================================
# SAVE METRICS
# =========================================================

with open(
    METRICS_PATH,
    "w"
) as file:

    json.dump(
        metrics,
        file,
        indent=2
    )


# =========================================================
# VERIFY MODEL
# =========================================================

print()
print("========================================")
print("MODEL SAVED")
print("========================================")

print(
    f"Model: {MODEL_PATH}"
)

print(
    f"Metrics: {METRICS_PATH}"
)

print()
print("Testing saved model...")

test_bundle = joblib.load(
    MODEL_PATH
)

test_model = test_bundle["model"]

test_features = test_bundle["features"]


print(
    f"Loaded features: {test_features}"
)

print(
    "Model reload: SUCCESS"
)

print()
print("========================================")
print("TRAINING COMPLETE")
print("========================================")