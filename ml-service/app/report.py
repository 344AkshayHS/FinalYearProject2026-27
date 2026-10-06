# Everything the admin dashboard shows about the model, read from the files the training scripts saved.
# Nothing here is calculated for show: each number comes from artifacts/ or the training data.
#
#   crop_model_info.json          train_location_model.py  (model, validation, conformal set)
#   model_comparison.csv          train_location_model.py  (7 models on held-out districts)
#   shap_lime_agreement.csv       explain.py               (SHAP vs LIME per crop)
#   calibration.json              calibration.py           (probability vs real share)
#   original_csv_results.csv      original_csv_train.py    (first experiment on the team's CSV)
#   feedback_retraining_log.csv   retrain_with_feedback.py (only after feedback retraining)

import json
from pathlib import Path
import os
from functools import lru_cache

import pandas as pd

ARTIFACTS = "artifacts"


def read_csv(name):
    path = os.path.join(ARTIFACTS, name)
    return pd.read_csv(path).to_dict(orient="records") if os.path.exists(path) else []


# The union territories among the names in the crop statistics (India has 28 states and 8 union territories today).
# The statistics are older than 2014-2020, so Telangana is inside "Andhra Pradesh", Ladakh inside "Jammu and Kashmir",
# and "Dadra and Nagar Haveli" is not yet joined with Daman and Diu.
UNION_TERRITORIES = {
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi",
    "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
}


@lru_cache(maxsize=1)
def dataset_summary():
    data = pd.read_csv("data/processed/india_dataset.csv")
    points = data.drop_duplicates(["Latitude", "Longitude"])
    karnataka = points[points["State"] == "Karnataka"]
    names = set(points["State"])
    return {
        "training_rows": len(data),
        "sample_points": len(points),
        "karnataka_points": len(karnataka),
        "states": len(names - UNION_TERRITORIES),
        "union_territories": len(names & UNION_TERRITORIES),
        "districts": int((points["State"] + points["Stats_District"]).nunique()),
        "crops": int(data["Crop"].nunique()),
        "points_per_state": points.groupby("State").size().sort_values(ascending=False).to_dict(),
    }


def build_report(model, features):
    info = json.loads(Path(os.path.join(ARTIFACTS, "crop_model_info.json")).read_text(encoding="utf-8"))
    calibration = json.loads(Path(os.path.join(ARTIFACTS, "calibration.json")).read_text(encoding="utf-8"))
    agreement = pd.read_csv(os.path.join(ARTIFACTS, "shap_lime_agreement.csv"))
    karnataka_crops = agreement[agreement["grown_in_karnataka"]]

    return {
        "model": {
            "version": info["model_version"],
            "type": info["model"],
            "settings": {"n_estimators": model.n_estimators, "min_samples_leaf": model.min_samples_leaf},
            "features": features,
            "crops": info["crops"],
            "validation": info["validation"],
            "accuracy_ceiling": info["accuracy_ceiling"],
            "karnataka_only_random_forest": info["karnataka_only_random_forest"],
            "conformal": info["conformal"],
            "feedback": info.get("feedback"),
        },
        # How much each feature is used by the trained forest (scikit-learn feature_importances_)
        "feature_importance": dict(zip(features, [round(float(v), 4) for v in model.feature_importances_])),
        "dataset": dataset_summary(),
        "model_comparison": read_csv("model_comparison.csv"),
        "shap_lime": {
            "mean_jaccard_all": round(float(agreement["jaccard_top3"].mean()), 3),
            "mean_spearman_all": round(float(agreement["spearman"].mean()), 3),
            "mean_jaccard_karnataka": round(float(karnataka_crops["jaccard_top3"].mean()), 3),
            "mean_spearman_karnataka": round(float(karnataka_crops["spearman"].mean()), 3),
            "per_crop": agreement.to_dict(orient="records"),
        },
        "calibration": calibration,
        "first_experiment": read_csv("original_csv_results.csv"),
        "feedback_retraining": read_csv("feedback_retraining_log.csv"),
    }
