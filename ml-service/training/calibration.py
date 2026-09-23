# How much can a farmer trust the model's numbers? Measured on districts the model never saw.
#
# The model is trained on crop area shares, so its probability for a crop should mean
# "the share of land like this that grows the crop". This script checks that (calibration), and
# measures how often the top crop really is the area's main crop, for each range of top probability.
# The app uses the second table to say how strong a recommendation is.
#
# Same Random Forest and same 5-fold GroupKFold by district as train_location_model.py.
# Output: artifacts/calibration.json
# Run from the ml-service folder:  python training/calibration.py

import json

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold

FEATURES = [
    "pH", "Nitrogen", "Organic_Carbon", "Clay", "Sand", "CEC",
    "Temperature", "Winter_Temperature", "Humidity", "Rainfall", "Monsoon_Rain_Share",
    "Post_Monsoon_Rain_Share", "Dry_Months", "Max_Temperature", "Solar_Radiation",
    "Elevation", "Slope",
]
TOP_BINS = [0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 1.0]
ALL_BINS = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.0]

data = pd.read_csv("data/processed/india_dataset.csv")
data["Group"] = data["State"] + " | " + data["Stats_District"]
crops = sorted(data["Crop"].unique())

# One row per sample point: the real crop shares there, and its features
shares = pd.crosstab([data["Latitude"], data["Longitude"]], data["Crop"], normalize="index")
shares = shares.reindex(columns=crops, fill_value=0)
points = data.drop_duplicates(["Latitude", "Longitude"]).set_index(["Latitude", "Longitude"]).loc[shares.index]

predicted = np.zeros(shares.shape)
for fold, (train_idx, test_idx) in enumerate(GroupKFold(n_splits=5).split(data, groups=data["Group"]), start=1):
    model = RandomForestClassifier(n_estimators=400, min_samples_leaf=3, random_state=42, n_jobs=-1)
    model.fit(data[FEATURES].iloc[train_idx], data["Crop"].iloc[train_idx])
    held_out = points["Group"].isin(set(data["Group"].iloc[test_idx])).values
    columns = [crops.index(c) for c in model.classes_]
    predicted[np.ix_(held_out, columns)] = model.predict_proba(points.loc[held_out, FEATURES])
    print(f"  fold {fold}/5 done")

real = shares.values
rows = np.arange(len(real))
top = predicted.argmax(axis=1)
top_probability = predicted[rows, top]
top_is_main_crop = real[rows, top] >= real.max(axis=1)

# 1. Calibration over every crop at every point: predicted probability vs real share
every = pd.DataFrame({"predicted": predicted.ravel(), "real_share": real.ravel()})
every["bin"] = pd.cut(every["predicted"], ALL_BINS, include_lowest=True)
calibration = every.groupby("bin", observed=True).agg(
    points=("predicted", "size"), mean_predicted=("predicted", "mean"), mean_real_share=("real_share", "mean")
)

# 2. For the top crop: how often is it really the area's main crop?
best = pd.DataFrame({"probability": top_probability, "main_crop": top_is_main_crop})
best["bin"] = pd.cut(best["probability"], TOP_BINS, include_lowest=True)
reliability = best.groupby("bin", observed=True).agg(points=("probability", "size"), main_crop_rate=("main_crop", "mean"))

print("\nCalibration (all crops):\n", calibration.round(3).to_string())
print("\nTop crop is the area's main crop:\n", reliability.round(3).to_string())

with open("artifacts/calibration.json", "w") as f:
    json.dump({
        "validation": "5-fold GroupKFold by district, one row per sample point",
        "calibration": [
            {"from": float(b.left), "to": float(b.right), "points": int(r.points),
             "mean_predicted": round(r.mean_predicted, 4), "mean_real_share": round(r.mean_real_share, 4)}
            for b, r in calibration.iterrows()
        ],
        "top_crop_reliability": [
            {"from": float(b.left), "to": float(b.right), "points": int(r.points), "main_crop_rate": round(r.main_crop_rate, 4)}
            for b, r in reliability.iterrows()
        ],
    }, f, indent=2)
print("\nSaved artifacts/calibration.json")
