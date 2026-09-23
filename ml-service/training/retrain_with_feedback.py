# Retrains the crop model with farmer feedback - but only keeps the new model if it is not worse.
#
# 1. In the backend folder:  npm run export-feedback   (writes data/raw/farmer_feedback.csv)
# 2. Here:                    python training/retrain_with_feedback.py
#
# How feedback is used:
#   - "good" or "average" = this crop grows on this land. The farm point is added to the training data
#     the same way build_dataset.py adds a point: 20 rows per 100% of the area, all of this crop.
#   - "poor" is counted but not used: it tells us what failed, not what would grow.
#
# The check (same as our paper's Rule 1): 5-fold GroupKFold by district on the government statistics.
# In each fold a Random Forest is trained with and without the feedback (feedback from the test
# districts is left out), and both are scored on the held-out districts. The new model is saved only
# if accuracy for India and for Karnataka each drops by less than MAX_DROP.
#
# If a new model is saved, run calibration.py and explain.py again: the numbers they saved describe
# the model this one replaces, and the app reads them for "Strong / Good / Possible choice".

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import GroupKFold

FEATURES = [
    "pH", "Nitrogen", "Organic_Carbon", "Clay", "Sand", "CEC",
    "Temperature", "Winter_Temperature", "Humidity", "Rainfall", "Monsoon_Rain_Share",
    "Post_Monsoon_Rain_Share", "Dry_Months", "Max_Temperature", "Solar_Radiation",
    "Elevation", "Slope",
]
COPIES_PER_FIELD = 20    # same as COPIES_PER_SHARE in build_dataset.py: one point = 20 rows
MAX_DROP = 0.005         # half a percentage point
GROWS = ["good", "average"]


def random_forest():
    # Same settings as train_location_model.py
    return RandomForestClassifier(n_estimators=400, min_samples_leaf=3, random_state=42, n_jobs=-1)


stats = pd.read_csv("data/processed/india_dataset.csv")
stats["Group"] = stats["State"] + " | " + stats["Stats_District"]
info = json.load(open("artifacts/crop_model_info.json"))
known_crops = set(info["crops"])

feedback = pd.read_csv("data/raw/farmer_feedback.csv")
poor = (feedback["Outcome"] == "poor").sum()
unknown = feedback[~feedback["Crop"].isin(known_crops)]
usable = feedback[feedback["Outcome"].isin(GROWS) & feedback["Crop"].isin(known_crops)].copy()
print(f"Feedback: {len(feedback)} rows | usable (good/average): {len(usable)} | poor (not used): {poor} "
      f"| unknown crop: {len(unknown)}")
if usable.empty:
    print("No usable feedback - the model is unchanged.")
    raise SystemExit

# Karnataka feedback carries the statistics district name, so it joins that district's group;
# other feedback gets its own group per district.
usable["Group"] = usable["State"].fillna("?") + " | " + usable["District"].fillna("?").str.upper()
feedback_rows = usable.loc[usable.index.repeat(COPIES_PER_FIELD)]

X, y, groups = stats[FEATURES], stats["Crop"], stats["Group"]
karnataka = (stats["State"] == "Karnataka").values
before = np.empty(len(stats), dtype=object)
after = np.empty(len(stats), dtype=object)

for fold, (train_idx, test_idx) in enumerate(GroupKFold(n_splits=5).split(X, y, groups=groups), start=1):
    test_groups = set(groups.iloc[test_idx])
    extra = feedback_rows[~feedback_rows["Group"].isin(test_groups)]

    before[test_idx] = random_forest().fit(X.iloc[train_idx], y.iloc[train_idx]).predict(X.iloc[test_idx])
    with_feedback = random_forest().fit(
        pd.concat([X.iloc[train_idx], extra[FEATURES]]), pd.concat([y.iloc[train_idx], extra["Crop"]])
    )
    after[test_idx] = with_feedback.predict(X.iloc[test_idx])
    print(f"  fold {fold}/5 done")

scores = {
    "india_before": accuracy_score(y, before),
    "india_after": accuracy_score(y, after),
    "karnataka_before": accuracy_score(y[karnataka], before[karnataka]),
    "karnataka_after": accuracy_score(y[karnataka], after[karnataka]),
}
print(f"\nHeld-out accuracy   India {scores['india_before']:.4f} -> {scores['india_after']:.4f}"
      f"   Karnataka {scores['karnataka_before']:.4f} -> {scores['karnataka_after']:.4f}")

keep = (scores["india_after"] >= scores["india_before"] - MAX_DROP
        and scores["karnataka_after"] >= scores["karnataka_before"] - MAX_DROP)

log = pd.DataFrame([{
    "date": pd.Timestamp.now().isoformat(timespec="seconds"),
    "usable_feedback": len(usable),
    **{name: round(value, 4) for name, value in scores.items()},
    "kept": keep,
}])
log_file = "artifacts/feedback_retraining_log.csv"
try:
    log = pd.concat([pd.read_csv(log_file), log])
except FileNotFoundError:
    pass
log.to_csv(log_file, index=False)

if not keep:
    print(f"Accuracy dropped by more than {MAX_DROP:.1%} - the new model is NOT saved.")
    raise SystemExit

final_model = random_forest().fit(pd.concat([X, feedback_rows[FEATURES]]), pd.concat([y, feedback_rows["Crop"]]))
# xz keeps the file under GitHub's 100 MB limit (about 60 MB instead of 120 MB)
joblib.dump(final_model, "artifacts/crop_model.joblib", compress=("xz", 9))
base_version = info["model_version"].split("+")[0]
info["model_version"] = f"{base_version}+fb{len(usable)}"
info["feedback"] = {"usable_rows": len(usable), **{name: round(value, 4) for name, value in scores.items()}}
with open("artifacts/crop_model_info.json", "w") as f:
    json.dump(info, f, indent=2)
print(f"Saved the new model as {info['model_version']}. Restart the ML service to use it.")
