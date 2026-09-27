# Trains and evaluates the crop model, following the three rules of our paper (SRVP-Ag).
#
# Rule 1 - External invariance: every score is measured on districts the model never saw
#          (5-fold GroupKFold by district), reported for all of India and for Karnataka.
# Rule 2 - Attribution concordance: see explain.py (SHAP vs LIME, Jaccard + Spearman).
# Rule 3 - Distributional bounds: a conformal prediction set - the crops the model is 90%
#          confident contain a crop really grown there - with its measured coverage.
#
# Models compared (as in the paper): single learners vs ensembles. The comparison also decides
# which model the app ships - see the selection rules below. Random Forest wins today.
#
# Season: every point is in the data once per season (Kharif, Rabi, Summer) with that season's crop mix,
# and the season is one of the model's inputs, so the answer changes with the season the farmer sows in.
#
# Note: all points in a district (in Karnataka: a taluk, see build_dataset.py) share one crop mix per
# season, so no model can reach 100%. The "ceiling" is the best possible accuracy (always answering that place's
# top crop). Folds are still whole districts: a Karnataka district's taluks are held out together.
#
# Run from the ml-service folder:  python training/train_location_model.py

import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    StackingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupKFold
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from forest import FEATURES, MIN_LEAF, SEASONS, YEAR_ROUND, random_forest

MODEL_VERSION = "rf-india-2.1"
CONFORMAL_LEVEL = 0.90

# The app does not use a fixed model: the winner of the comparison below is saved and shipped.
# Two rules decide the winner:
#   1. it must be a tree model, because the app explains every recommendation with SHAP, and only
#      tree models give exact SHAP values fast enough to answer while the farmer waits;
#   2. among those, the best "top-3 contains the district's main crop" on held-out districts,
#      because the app shows the farmer several crops, not only one.
# Today Random Forest wins. If new data ever makes another model win, it is shipped instead.
CAN_EXPLAIN_WITH_TREE_SHAP = ["Decision Tree", "Random Forest"]
SELECTION_SCORE = "india_top3_main_crop"


def stacking(X, y, groups):
    # Meta-model (Logistic Regression) learns from base-model predictions on districts they
    # did not train on (inner GroupKFold), so it doesn't over-trust them.
    inner_folds = list(GroupKFold(n_splits=4).split(X, y, groups=groups))
    return StackingClassifier(
        estimators=[
            ("random_forest", random_forest()),
            ("extra_trees", ExtraTreesClassifier(n_estimators=300, min_samples_leaf=MIN_LEAF, random_state=42, n_jobs=-1)),
            ("gradient_boosting", HistGradientBoostingClassifier(max_iter=100, random_state=42)),
        ],
        final_estimator=LogisticRegression(max_iter=2000),
        stack_method="predict_proba",
        cv=inner_folds,
        n_jobs=None,   # one base model at a time (each already uses every core); several forests at once run out of memory
    )


def all_models(X, y, groups):
    return {
        "Naive Bayes": GaussianNB(),
        "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
        "KNN": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=25)),
        "Decision Tree": DecisionTreeClassifier(min_samples_leaf=5, random_state=42),
        "MLP": make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(64, 64), max_iter=300, random_state=42)),
        "Random Forest": random_forest(),
        "Stacking (RF+ET+HGB -> LR)": stacking(X, y, groups),
    }


def full_probabilities(model, X, all_crops):
    # predict_proba only has columns for crops seen in training; put them in the full crop order
    probabilities = np.zeros((len(X), len(all_crops)))
    columns = [all_crops.index(c) for c in model.classes_]
    probabilities[:, columns] = model.predict_proba(X)
    return probabilities


def scores(rows, predicted, probabilities, all_crops):
    # Accuracy and macro-F1 over all rows, plus: is the main crop of the point's place (its taluk in
    # Karnataka, its district elsewhere) in that season in the top 3? (per point and season)
    acc = accuracy_score(rows["Crop"], predicted)
    f1 = f1_score(rows["Crop"], predicted, average="macro")
    main_crop = rows.groupby(["Place", "Season"])["Crop"].agg(lambda c: c.value_counts().index[0])
    first = ~rows.duplicated(["Latitude", "Longitude", "Season"])
    top3 = np.array(all_crops)[np.argsort(probabilities[first.values], axis=1)[:, ::-1][:, :3]]
    hits = [main_crop[(p, s)] in row for p, s, row in zip(rows.loc[first, "Place"], rows.loc[first, "Season"], top3)]
    return acc, f1, float(np.mean(hits))


def ceiling(rows):
    return rows.groupby(["Latitude", "Longitude", "Season"])["Crop"].agg(lambda c: c.value_counts(normalize=True).iloc[0]).mean()


def conformal_threshold(true_crop_probabilities, level):
    # Split conformal: the score is 1 - probability given to the crop really grown
    scores = 1 - true_crop_probabilities
    n = len(scores)
    return float(np.quantile(scores, min(1.0, np.ceil((n + 1) * level) / n), method="higher"))


# --- Data ---------------------------------------------------------------------

data = pd.read_csv("data/processed/india_dataset.csv")
data["Group"] = data["State"] + " | " + data["Stats_District"]   # one statistics district = one group
X, y, groups = data[FEATURES], data["Crop"], data["Group"]
all_crops = sorted(y.unique())
karnataka = (data["State"] == "Karnataka").values
folds = list(GroupKFold(n_splits=5).split(X, y, groups=groups))

print(f"Rows: {len(data)} | districts: {groups.nunique()} | crops: {len(all_crops)} "
      f"| Karnataka districts: {data.loc[karnataka, 'Group'].nunique()}")
print(f"Accuracy ceiling - India: {ceiling(data):.4f} | Karnataka: {ceiling(data[karnataka]):.4f}\n")

# --- Rule 1: every model, scored on held-out districts ------------------------

names = list(all_models(X, y, groups))
predicted = {name: np.empty(len(data), dtype=object) for name in names}
probabilities = {name: np.zeros((len(data), len(all_crops))) for name in names}

for fold, (train_idx, test_idx) in enumerate(folds, start=1):
    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    models = all_models(X_train, y_train, groups.iloc[train_idx])
    for name in names:
        model = models.pop(name).fit(X_train, y_train)   # one fitted model in memory at a time
        predicted[name][test_idx] = model.predict(X.iloc[test_idx])
        probabilities[name][test_idx] = full_probabilities(model, X.iloc[test_idx], all_crops)
        del model
    print(f"  fold {fold}/5 done")

results = []
print(f"\n{'Model':30s} {'India acc':>9s} {'macro-F1':>9s} {'top-3':>7s} | {'Karnataka acc':>13s} {'macro-F1':>9s} {'top-3':>7s}")
for name in names:
    india = scores(data, predicted[name], probabilities[name], all_crops)
    kar = scores(data[karnataka], predicted[name][karnataka], probabilities[name][karnataka], all_crops)
    print(f"{name:30s} {india[0]:9.4f} {india[1]:9.4f} {india[2]:7.1%} | {kar[0]:13.4f} {kar[1]:9.4f} {kar[2]:7.1%}")
    results.append({
        "model": name,
        "india_accuracy": round(india[0], 4), "india_macro_f1": round(india[1], 4), "india_top3_main_crop": round(india[2], 4),
        "karnataka_accuracy": round(kar[0], 4), "karnataka_macro_f1": round(kar[1], 4), "karnataka_top3_main_crop": round(kar[2], 4),
    })
pd.DataFrame(results).to_csv("artifacts/model_comparison.csv", index=False)

# --- Pick the model the app will use ------------------------------------------

can_ship = [r for r in results if r["model"] in CAN_EXPLAIN_WITH_TREE_SHAP]
FINAL_MODEL = max(can_ship, key=lambda r: r[SELECTION_SCORE])["model"]
print(f"\nThe app will use: {FINAL_MODEL} (best {SELECTION_SCORE} of {', '.join(CAN_EXPLAIN_WITH_TREE_SHAP)})")

# --- Does training on all of India help Karnataka? ------------------------------

kar_data = data[karnataka].reset_index(drop=True)
kar_predicted = np.empty(len(kar_data), dtype=object)
kar_probabilities = np.zeros((len(kar_data), len(all_crops)))
for train_idx, test_idx in GroupKFold(n_splits=5).split(kar_data, groups=kar_data["Group"]):
    model = random_forest().fit(kar_data[FEATURES].iloc[train_idx], kar_data["Crop"].iloc[train_idx])
    kar_predicted[test_idx] = model.predict(kar_data[FEATURES].iloc[test_idx])
    kar_probabilities[test_idx] = full_probabilities(model, kar_data[FEATURES].iloc[test_idx], all_crops)
kar_only = scores(kar_data, kar_predicted, kar_probabilities, all_crops)
print(f"\nRandom Forest trained on Karnataka only -> Karnataka acc={kar_only[0]:.4f} "
      f"macro-F1={kar_only[1]:.4f} top-3={kar_only[2]:.1%}")

# --- Rule 3: conformal prediction set (selected model, held-out Karnataka districts) --

selected_probabilities = probabilities[FINAL_MODEL][karnataka]
true_probability = selected_probabilities[np.arange(len(kar_data)), [all_crops.index(c) for c in kar_data["Crop"]]]
kar_groups = kar_data["Group"].unique()
halves = [kar_groups[::2], kar_groups[1::2]]
coverage, set_size = [], []
for calibrate, evaluate in [(halves[0], halves[1]), (halves[1], halves[0])]:
    threshold = conformal_threshold(true_probability[kar_data["Group"].isin(calibrate)], CONFORMAL_LEVEL)
    in_eval = kar_data["Group"].isin(evaluate).values
    coverage.append(np.mean(1 - true_probability[in_eval] <= threshold))
    set_size.append(np.mean((1 - selected_probabilities[in_eval] <= threshold).sum(axis=1)))
final_threshold = conformal_threshold(true_probability, CONFORMAL_LEVEL)
print(f"Conformal set ({CONFORMAL_LEVEL:.0%} target): measured coverage {np.mean(coverage):.1%} "
      f"on held-out Karnataka districts, average set size {np.mean(set_size):.1f} crops")

# --- Final model for the app: the selected model, trained on all districts ----

final_model = all_models(X, y, groups)[FINAL_MODEL].fit(X, y)
# xz keeps the file under GitHub's 100 MB limit (about 60 MB instead of 120 MB)
joblib.dump(final_model, "artifacts/crop_model.joblib", compress=("xz", 9))
with open("artifacts/crop_model_info.json", "w") as f:
    json.dump({
        "model_version": MODEL_VERSION,
        "model": FINAL_MODEL,
        "selection_rule": f"best {SELECTION_SCORE} among models with exact tree SHAP "
                          f"({', '.join(CAN_EXPLAIN_WITH_TREE_SHAP)})",
        "features": FEATURES,
        "seasons": SEASONS,
        "year_round": YEAR_ROUND,
        "crops": list(final_model.classes_),
        "rows": len(data),
        "districts": int(groups.nunique()),
        "validation": "5-fold GroupKFold by district",
        "labels": "Crop-area shares per season (Kharif, Rabi, Summer). Karnataka: taluk crop-area shares, the average of the Agriculture Census 2010-11 and 2015-16 "
                  "and Karnataka DES 2019-22 (Karnataka At A Glance). "
                  "Elsewhere: district crop-area shares from the ICRISAT district database 2015-2019 where "
                  "available, data.gov.in 2010-2014 elsewhere, plus Coffee Board planted area and "
                  "Horticultural Statistics at a Glance 2018 for fruit and vegetables. Seasons: each crop's "
                  "Kharif/Rabi/Summer split in its district (ICRISAT 2015-2019 and data.gov.in 2010-2014); "
                  "plantation crops, fruit trees and sugarcane count in every season",
        "accuracy_ceiling": {"india": round(ceiling(data), 4), "karnataka": round(ceiling(data[karnataka]), 4)},
        "results": results,
        "karnataka_only_random_forest": dict(zip(["accuracy", "macro_f1", "top3_main_crop"], map(float, kar_only))),
        "conformal": {
            "level": CONFORMAL_LEVEL,
            "threshold": final_threshold,
            "measured_coverage_karnataka": float(np.mean(coverage)),
            "average_set_size_karnataka": float(np.mean(set_size)),
        },
    }, f, indent=2)
print("\nSaved artifacts/crop_model.joblib")
