# Do taluk labels make the model more accurate for Karnataka? Answers it before the app switches.
#
# Trains the same Random Forest twice on the same points, with the same districts held out:
#   A. Karnataka points labelled with their district's crop mix (the old way)
#   B. Karnataka points labelled with their taluk's crop mix (Agriculture Census, build_dataset.py)
# and scores both on the held-out Karnataka points, the way the app is used:
#   - GPS:      is the crop really grown most in the point's TALUK the model's first crop / in its top 3?
#   - District: the model averaged over all the district's points (what the app shows when a district
#               is picked by hand) - is the crop grown most in the DISTRICT first / in the top 3?
#   - Taluk picked by hand: the taluk's average blended with its district's, for several weights on the
#               taluk - is the crop grown most in the TALUK first / in the top 3? The best weight with taluk
#               labels is saved to artifacts/taluk_weight.json, and the ML service answers picked taluks with
#               it. If the taluk alone is not more accurate, the weight moves towards the district.
# Every question is asked per season (Kharif, Rabi, Summer): the truth is the crop grown most there in
# that season, and the model is asked with that season.
# Every district is held out exactly once (5 folds of whole districts), so no score is measured on a
# place the model trained on.
#
# Run from the ml-service folder, after build_dataset.py:  python training/compare_taluk_labels.py [--truth <file>]

import json
import sys

import numpy as np
import pandas as pd

from forest import FEATURES, random_forest

COPIES_PER_SHARE = 20   # as in build_dataset.py
OUT_FILE = "artifacts/taluk_label_comparison.csv"
PICK_FILE = "artifacts/taluk_pick_comparison.csv"
WEIGHT_FILE = "artifacts/taluk_weight.json"      # read by the ML service
TALUK_WEIGHTS = [0.0, 0.25, 0.5, 0.75, 1.0]      # 0 = the district's answer, 1 = the taluk's alone


def main_crop(shares, key):
    """{(place, season): the crop with the biggest share there in that season}"""
    top = shares.sort_values("Share", ascending=False).drop_duplicates([key, "Season"])
    return dict(zip(zip(top[key], top["Season"]), top["Crop"]))


taluk_data = pd.read_csv("data/processed/india_dataset.csv")
district_share = pd.read_csv("data/processed/district_crop_share.csv")
# What each taluk really grows most - by default the labels just built. With --truth <file>, another
# taluk_crop_share.csv, so two label versions can be scored against the same yardstick.
truth_file = sys.argv[sys.argv.index("--truth") + 1] if "--truth" in sys.argv else "data/processed/taluk_crop_share.csv"
taluk_share = pd.read_csv(truth_file)

# B is the dataset as built. A: the same points, Karnataka's taluk-labelled ones relabelled by district.
relabel = (taluk_data["State"] == "Karnataka") & ~taluk_data["Place"].str.contains(r" \| ", regex=True)
points = taluk_data[relabel].drop_duplicates(["Latitude", "Longitude", "Season"]).drop(columns=["Crop", "Share"])
karnataka_share = district_share[district_share["State"] == "Karnataka"][["Stats_District", "Season", "Crop", "Share"]]
district_rows = points.merge(karnataka_share, on=["Stats_District", "Season"])
district_rows = district_rows.loc[district_rows.index.repeat((district_rows["Share"] * COPIES_PER_SHARE).round().astype(int))]
district_data = pd.concat([taluk_data[~relabel], district_rows], ignore_index=True)
datasets = {"A. district labels": district_data, "B. taluk labels": taluk_data}

# One fold per district, the same for both datasets - and for every label version: it depends only on
# the district names (every 5th district in alphabetical order), not on how many rows a district has,
# so two runs with different labels hold out exactly the same districts and can be compared
groups = taluk_data["State"] + " | " + taluk_data["Stats_District"]
fold_of = {group: i % 5 for i, group in enumerate(sorted(groups.unique()))}

# Every Karnataka point once per season, with the truth for both questions
karnataka_points = taluk_data[taluk_data["State"] == "Karnataka"].drop_duplicates(["Latitude", "Longitude", "Season"])
karnataka_points = karnataka_points.reset_index(drop=True)
taluk_main = main_crop(taluk_share, "Place")
district_main = main_crop(karnataka_share, "Stats_District")
karnataka_points["District_main"] = [district_main.get(key) for key in
                                     zip(karnataka_points["Stats_District"], karnataka_points["Season"])]
karnataka_points["Taluk_main"] = [taluk_main.get(key, district) for key, district in   # no taluk: its district's crop
                                  zip(zip(karnataka_points["Place"], karnataka_points["Season"]), karnataka_points["District_main"])]
karnataka_points["Fold"] = ("Karnataka | " + karnataka_points["Stats_District"]).map(fold_of)

results, taluk_picks = [], []
for name, data in datasets.items():
    data_groups = data["State"] + " | " + data["Stats_District"]
    crops = sorted(data["Crop"].unique())
    probabilities = np.zeros((len(karnataka_points), len(crops)))
    for fold in range(5):
        train = data[data_groups.map(fold_of) != fold]
        model = random_forest().fit(train[FEATURES], train["Crop"])
        held_out = (karnataka_points["Fold"] == fold).values
        columns = [crops.index(c) for c in model.classes_]
        probabilities[np.ix_(held_out, columns)] = model.predict_proba(karnataka_points.loc[held_out, FEATURES])
        print(f"  {name}: fold {fold + 1}/5 done", flush=True)

    ranked = np.array(crops)[np.argsort(probabilities, axis=1)[:, ::-1]]
    gps_first = np.mean(ranked[:, 0] == karnataka_points["Taluk_main"].values)
    gps_top3 = np.mean([truth in row[:3] for truth, row in zip(karnataka_points["Taluk_main"], ranked)])
    # Only the points whose taluk has census figures - where A and B really differ
    in_census = ~karnataka_points["Place"].str.contains(r" \| ", regex=True).values
    census_top3 = np.mean([truth in row[:3] for truth, row in
                           zip(karnataka_points["Taluk_main"][in_census], ranked[in_census])])

    district_first, district_top3 = [], []
    district_average = {}
    for (district, season), rows in karnataka_points.groupby(["Stats_District", "Season"]):
        average = probabilities[karnataka_points.index.get_indexer(rows.index)].mean(axis=0)
        district_average[(district, season)] = average
        if (district, season) not in district_main:   # nothing sown there in that season
            continue
        top = np.array(crops)[np.argsort(average)[::-1][:3]]
        district_first.append(top[0] == district_main[(district, season)])
        district_top3.append(district_main[(district, season)] in top)

    # A taluk picked by hand: blend the taluk's average with its district's, and see which weight on the
    # taluk best finds the crop the taluk really grows most (only taluks with census figures)
    for weight in TALUK_WEIGHTS:
        first, top3 = [], []
        for (place, season), rows in karnataka_points[in_census].groupby(["Place", "Season"]):
            if (place, season) not in taluk_main:   # nothing sown there in that season
                continue
            taluk_average = probabilities[karnataka_points.index.get_indexer(rows.index)].mean(axis=0)
            blend = weight * taluk_average + (1 - weight) * district_average[(rows["Stats_District"].iloc[0], season)]
            top = np.array(crops)[np.argsort(blend)[::-1][:3]]
            first.append(top[0] == taluk_main[(place, season)])
            top3.append(taluk_main[(place, season)] in top)
        taluk_picks.append({"labels": name, "taluk_weight": weight, "first_is_taluk_main_crop": round(float(np.mean(first)), 4),
                            "top3_has_taluk_main_crop": round(float(np.mean(top3)), 4), "taluk_seasons": len(first)})

    results.append({"labels": name, "gps_first_is_taluk_main_crop": round(gps_first, 4),
                    "gps_top3_has_taluk_main_crop": round(gps_top3, 4),
                    "gps_top3_in_census_taluks": round(float(census_top3), 4), "census_taluk_points": int(in_census.sum()),
                    "district_first_is_main_crop": round(float(np.mean(district_first)), 4),
                    "district_top3_has_main_crop": round(float(np.mean(district_top3)), 4),
                    "karnataka_point_seasons": len(karnataka_points), "district_seasons": len(district_first)})

table = pd.DataFrame(results)
table.to_csv(OUT_FILE, index=False)
print("\nHeld-out Karnataka (districts the model never saw):")
print(table.to_string(index=False))
print("Saved", OUT_FILE)

# The weight the app uses for a picked taluk: the best top-3 score with taluk labels; on a tie the
# smaller weight wins, because leaning on the district is the safer answer
picks = pd.DataFrame(taluk_picks)
picks.to_csv(PICK_FILE, index=False)
best = picks[picks["labels"] == "B. taluk labels"].sort_values(
    ["top3_has_taluk_main_crop", "first_is_taluk_main_crop", "taluk_weight"], ascending=[False, False, True]).iloc[0]
with open(WEIGHT_FILE, "w") as f:
    json.dump({"taluk_weight": float(best["taluk_weight"]),
               "rule": "picked taluk = weight x taluk average + (1 - weight) x district average; "
                       "taluks without census figures use the district only",
               "measured": picks[picks["labels"] == "B. taluk labels"].to_dict("records")}, f, indent=2)
print("\nA taluk picked by hand (held-out taluks with census figures):")
print(picks.to_string(index=False))
print(f"Weight on the taluk the app will use: {best['taluk_weight']} -> saved {WEIGHT_FILE}")
