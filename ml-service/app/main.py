# GreenRoot ML service.
#
#   GET  /soil?lat=..&lng=..     -> topsoil values for that point (ISRIC SoilGrids)
#   GET  /climate?lat=..&lng=..  -> 20-year climate for that point (NASA POWER)
#   GET  /terrain?lat=..&lng=..  -> height above sea level and steepness (Open-Meteo elevation)
#   GET  /report                 -> training results for the admin dashboard (app/report.py)
#   POST /predict                -> top 5 crops, the 90% confident set, SHAP + LIME for the top crop,
#                                   and how often a top crop with this probability was right in testing
#
# Needs the files made by the training scripts (see training/ folder).
# Run from the ml-service folder:  uvicorn app.main:app --env-file .env --port 8000

import json

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from lime.lime_tabular import LimeTabularExplainer
from pydantic import BaseModel

from app.climate import get_climate
from app.report import build_report
from app.soilgrids import get_soil
from app.terrain import get_terrain

model = joblib.load("artifacts/crop_model.joblib")
model_info = json.load(open("artifacts/crop_model_info.json"))
FEATURES = model_info["features"]
crops = list(model.classes_)
confident_threshold = model_info["conformal"]["threshold"]
# How often the top crop was really the area's main crop, per range of its probability (training/calibration.py)
top_crop_reliability = json.load(open("artifacts/calibration.json"))["top_crop_reliability"]

shap_explainer = shap.TreeExplainer(model)   # exact and fast for Random Forest
lime_explainer = LimeTabularExplainer(
    pd.read_csv("artifacts/lime_sample.csv")[FEATURES].values,
    feature_names=FEATURES,
    class_names=crops,
    discretize_continuous=False,
    random_state=42,
)

app = FastAPI(title="GreenRoot ML Service")


class Features(BaseModel):
    pH: float
    Nitrogen: float
    Organic_Carbon: float
    Clay: float
    Sand: float
    CEC: float
    Temperature: float
    Winter_Temperature: float
    Humidity: float
    Rainfall: float
    Monsoon_Rain_Share: float
    Post_Monsoon_Rain_Share: float
    Dry_Months: int
    Max_Temperature: float
    Solar_Radiation: float
    Elevation: float
    Slope: float


@app.get("/")
def home():
    return {"status": "ML service is running", "model": model_info["model_version"]}


@app.get("/report")
def report():
    return build_report(model, FEATURES)


@app.get("/soil")
def soil(lat: float, lng: float):
    result = get_soil(lat, lng)
    if result is None:
        raise HTTPException(status_code=404, detail="no_soil_data")
    return result


@app.get("/climate")
def climate(lat: float, lng: float):
    return get_climate(lat, lng)


@app.get("/terrain")
def terrain(lat: float, lng: float):
    return get_terrain(lat, lng)


def reliability(probability):
    for row in top_crop_reliability:
        if row["from"] < probability <= row["to"]:
            return row["main_crop_rate"]
    return top_crop_reliability[-1]["main_crop_rate"]


def predict_table(values):
    # LIME passes plain number arrays; the model was trained on a table with column names
    return model.predict_proba(pd.DataFrame(values, columns=FEATURES))


@app.post("/predict")
def predict(features: Features):
    row = pd.DataFrame([features.model_dump()])[FEATURES]
    probabilities = model.predict_proba(row)[0]
    order = np.argsort(probabilities)[::-1]

    # Explain the top crop only, to keep the response fast
    top = order[0]
    shap_values = shap_explainer.shap_values(row)[0][:, top]
    lime_result = lime_explainer.explain_instance(
        row.values[0], predict_table, labels=(top,), num_features=len(FEATURES), num_samples=500
    )

    recommendations = []
    for rank, index in enumerate(order[:5]):
        probability = float(probabilities[index])
        recommendations.append({
            "crop": crops[index],
            "probability": round(probability, 5),
            "score": round(probability * 100, 1),
            # Rule 3: is this crop inside the 90% conformal prediction set?
            "confident": bool(1 - probability <= confident_threshold),
            "shap": {f: round(float(v), 4) for f, v in zip(FEATURES, shap_values)} if rank == 0 else None,
            "lime": {f: round(float(w), 4) for f, w in lime_result.as_list(label=top)} if rank == 0 else None,
        })

    return {
        "model_version": model_info["model_version"],
        "recommendations": recommendations,
        "top_crop_reliability": reliability(float(probabilities[top])),
    }

