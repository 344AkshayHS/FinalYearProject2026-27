# How well does the model answer in each state? Measured on districts the model never saw.
#
# The app's Random Forest settings, 5 folds of whole districts (the same folds as
# compare_taluk_labels.py). For every sample point and season the model's crops are compared with the
# crop really grown most in its place in that season - the district (the taluk in Karnataka) - and for
# every district and season with the model averaged over its points, the way the app answers a district
# picked by hand.
#
# Per state: how often the main crop is the model's first crop, how often it is in the top 3, and how
# often it is not even in the top 5 ("wrong"). Also lists the districts the model has no labels for
# (no crop statistics), where it still answers but could not be tested.
#
# Output: artifacts/state_accuracy.csv
# Run from the ml-service folder:  python training/check_states.py

import numpy as np
import pandas as pd

from forest import FEATURES, SEASONS, random_forest

OUT_FILE = "artifacts/state_accuracy.csv"

data = pd.read_csv("data/processed/india_dataset.csv")
groups = data["State"] + " | " + data["Stats_District"]
fold_of = {group: i % 5 for i, group in enumerate(sorted(groups.unique()))}
crops = sorted(data["Crop"].unique())

points = data.drop_duplicates(["Latitude", "Longitude", "Season"]).copy()
main_crop = data.groupby(["Place", "Season"])["Crop"].agg(lambda c: c.value_counts().index[0])
district_main = data.groupby(["State", "Stats_District", "Season"])["Crop"].agg(lambda c: c.value_counts().index[0])
points["Main"] = [main_crop[key] for key in zip(points["Place"], points["Season"])]
points["Fold"] = (points["State"] + " | " + points["Stats_District"]).map(fold_of)

probabilities = np.zeros((len(points), len(crops)))
for fold in range(5):
    train = data[groups.map(fold_of) != fold]
    model = random_forest().fit(train[FEATURES], train["Crop"])
    held_out = (points["Fold"] == fold).values
    columns = [crops.index(c) for c in model.classes_]
    probabilities[np.ix_(held_out, columns)] = model.predict_proba(points.loc[held_out, FEATURES])
    print(f"  fold {fold + 1}/5 done", flush=True)

ranked = np.array(crops)[np.argsort(probabilities, axis=1)[:, ::-1]]
points["First"] = ranked[:, 0] == points["Main"].values
points["Top3"] = [m in row[:3] for m, row in zip(points["Main"], ranked)]
points["Top5"] = [m in row[:5] for m, row in zip(points["Main"], ranked)]

# Districts, answered as the app answers a district picked by hand: the model averaged over its points
district_rows = []
for (state, district, season), rows in points.groupby(["State", "Stats_District", "Season"]):
    average = probabilities[points.index.get_indexer(rows.index)].mean(axis=0)
    top = np.array(crops)[np.argsort(average)[::-1][:3]]
    district_rows.append({"State": state, "District_top3": district_main[(state, district, season)] in top})
districts = pd.DataFrame(district_rows)

table = points.groupby("State").agg(points=("Main", "size"), first=("First", "mean"), top3=("Top3", "mean"),
                                     wrong=("Top5", lambda s: 1 - s.mean()))
table["districts"] = districts.groupby("State").size()
table["district_top3"] = districts.groupby("State")["District_top3"].mean()
table = table.sort_values("points", ascending=False).round(3)
table.to_csv(OUT_FILE)

outside = points["State"] != "Karnataka"
print(f"\nAll India      points {len(points):5d} | first {points['First'].mean():.1%} | top 3 {points['Top3'].mean():.1%} "
      f"| wrong (not in top 5) {1 - points['Top5'].mean():.1%} | districts top 3 {districts['District_top3'].mean():.1%}")
print(f"Outside Karn.  points {outside.sum():5d} | first {points.loc[outside, 'First'].mean():.1%} | "
      f"top 3 {points.loc[outside, 'Top3'].mean():.1%} | wrong {1 - points.loc[outside, 'Top5'].mean():.1%} | "
      f"districts top 3 {districts.loc[districts['State'] != 'Karnataka', 'District_top3'].mean():.1%}")
print(f"Karnataka      points {(~outside).sum():5d} | first {points.loc[~outside, 'First'].mean():.1%} | "
      f"top 3 {points.loc[~outside, 'Top3'].mean():.1%} | wrong {1 - points.loc[~outside, 'Top5'].mean():.1%}")
print("\n" + table.to_string())
names = {code: name for name, code in SEASONS.items()}
print("\nPer season, all India (First / Top3 / Top5 = share of points):")
print(points.groupby("Season")[["First", "Top3", "Top5"]].mean().rename(index=names).round(3).to_string())

# Matched by the points themselves: the location file still uses old state names (Orissa, Uttaranchal)
features = pd.read_csv("data/raw/india_location_features.csv")
labelled = set(zip(data["Latitude"], data["Longitude"]))
has_label = [(lat, lng) in labelled for lat, lng in zip(features["Latitude"], features["Longitude"])]
untested = features.loc[~pd.Series(has_label, index=features.index), ["State", "District"]].drop_duplicates()
print(f"\nDistricts with no crop statistics (the app answers there, but it could not be tested): {len(untested)}")
print(untested.groupby("State")["District"].apply(lambda d: ", ".join(sorted(d))).to_string())
print(f"Saved {OUT_FILE}")
