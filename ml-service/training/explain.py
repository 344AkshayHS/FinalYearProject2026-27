# Rule 2 of our paper (attribution concordance): explain the crop model with SHAP and LIME,
# and measure how much they agree - per crop, as a number, not by looking at charts.
#
# For every crop we take up to 10 sample points from the districts where that crop has the
# biggest share of farmland, and ask both methods which features pushed the model towards it.
# Per crop we report:
#   - top-3 Jaccard index:  J = |SHAP top-3 ∩ LIME top-3| / |SHAP top-3 ∪ LIME top-3|
#   - Spearman rank correlation between the full SHAP and LIME importance rankings
#
# Run from the ml-service folder (after train_location_model.py):  python training/explain.py

import joblib
import numpy as np
import pandas as pd
import shap
from lime.lime_tabular import LimeTabularExplainer
from scipy.stats import spearmanr

POINTS_PER_CROP = 10

model = joblib.load("artifacts/crop_model.joblib")
FEATURES = list(model.feature_names_in_)
crops = list(model.classes_)

data = pd.read_csv("data/processed/india_dataset.csv")
points = data.drop_duplicates(["Latitude", "Longitude", "Season"])
shares = pd.read_csv("data/processed/district_crop_share.csv")

# LIME needs example rows to learn what "normal" values look like. The app uses the same file.
lime_sample = points[FEATURES].sample(min(1000, len(points)), random_state=42)
lime_sample.to_csv("artifacts/lime_sample.csv", index=False)

shap_explainer = shap.TreeExplainer(model)
lime_explainer = LimeTabularExplainer(
    lime_sample.values, feature_names=FEATURES, class_names=crops, discretize_continuous=False, random_state=42
)


def top3(importance):
    return set(pd.Series(importance, index=FEATURES).sort_values(ascending=False).index[:3])


# The crop shares of the districts we actually have sample points for
in_data = shares.merge(points[["State", "Stats_District"]].drop_duplicates(), on=["State", "Stats_District"])

rows = []
for crop_index, crop in enumerate(crops):
    # The 3 districts (and seasons) where this crop has the biggest share
    best = in_data[in_data["Crop"] == crop].sort_values("Share", ascending=False).head(3)
    sample = points.merge(best[["State", "Stats_District", "Season"]], on=["State", "Stats_District", "Season"])[FEATURES]
    sample = sample.head(POINTS_PER_CROP)
    if sample.empty:
        print(f"{crop:18s} skipped - no sample points")
        continue

    shap_importance = np.abs(shap_explainer.shap_values(sample)[:, :, crop_index]).mean(axis=0)

    lime_importance = np.zeros(len(FEATURES))
    for row in sample.values:
        explanation = lime_explainer.explain_instance(
            row, model.predict_proba, labels=(crop_index,), num_features=len(FEATURES), num_samples=1000
        )
        for feature, weight in explanation.as_list(label=crop_index):
            lime_importance[FEATURES.index(feature)] += abs(weight)
    lime_importance /= len(sample)

    shap_top, lime_top = top3(shap_importance), top3(lime_importance)
    jaccard = len(shap_top & lime_top) / len(shap_top | lime_top)
    spearman = spearmanr(shap_importance, lime_importance).statistic
    grown_in_karnataka = crop in set(shares.loc[shares["State"] == "Karnataka", "Crop"])
    rows.append({
        "crop": crop,
        "grown_in_karnataka": grown_in_karnataka,
        "points_explained": len(sample),
        "shap_top3": ", ".join(sorted(shap_top)),
        "lime_top3": ", ".join(sorted(lime_top)),
        "jaccard_top3": round(jaccard, 3),
        "spearman": round(spearman, 3),
    })
    print(f"{crop:18s} SHAP={sorted(shap_top)}  LIME={sorted(lime_top)}  J={jaccard:.2f}  rho={spearman:.2f}")

result = pd.DataFrame(rows)
result.to_csv("artifacts/shap_lime_agreement.csv", index=False)
karnataka_crops = result[result["grown_in_karnataka"]]
print(f"\nAll {len(result)} crops:        mean top-3 Jaccard {result['jaccard_top3'].mean():.3f}, "
      f"mean Spearman {result['spearman'].mean():.3f}")
print(f"{len(karnataka_crops)} Karnataka crops:  mean top-3 Jaccard {karnataka_crops['jaccard_top3'].mean():.3f}, "
      f"mean Spearman {karnataka_crops['spearman'].mean():.3f}")
print("How many crops got each Jaccard value:")
print(result["jaccard_top3"].value_counts().sort_index().to_string())
