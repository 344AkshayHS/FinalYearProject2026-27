# Checks every Karnataka district in every season: does the model's top 3 contain the crop farmers
# really grow most there in that season?
#
# This is the question a visitor asks first - "pick my district and see if it is right" - so it is
# worth answering for all 30 districts at once, before a demonstration.
#
# For each district it does what the app does when a district is chosen by hand: averages the model
# over all the district's sample points (artifacts/karnataka_district_points.csv), and compares the
# top 3 with the district's real crop shares from the statistics.
#
# It uses the final model, which was trained on these points, so it shows what the app answers today.
# The honest score on districts the model never saw is in training/compare_taluk_labels.py.
#
# It needs no server and no internet: the model file and the data files are enough.
# Run from the ml-service folder (after make_district_points.py):  python training/check_districts.py

import json

import joblib
import numpy as np
import pandas as pd

TOP = 3

model = joblib.load("artifacts/crop_model.joblib")
FEATURES = list(model.feature_names_in_)
crops = np.array(model.classes_)
info = json.load(open("artifacts/crop_model_info.json"))
SEASONS, YEAR_ROUND = info["seasons"], set(info["year_round"])

points = pd.read_csv("artifacts/karnataka_district_points.csv")
shares = pd.read_csv("data/processed/district_crop_share.csv")
shares = shares[shares["State"] == "Karnataka"]
field_crops = pd.read_csv("artifacts/season_field_crops.csv")   # what each district sows per season
des = pd.read_csv("data/raw/karnataka_des_season_area.csv")        # the crop survey, to compare with

rows = []
for season, code in SEASONS.items():
    print(f"\n--- {season}")
    for district in sorted(shares["Stats_District"].unique()):
        in_district = points[points["District"] == district].assign(Season=code)
        real = shares[(shares["Stats_District"] == district) & (shares["Season"] == code)]
        if in_district.empty or real.empty:
            print(f"     {district:18s} no sample points or nothing sown in {season} - skipped")
            continue

        probabilities = model.predict_proba(in_district[FEATURES]).mean(axis=0)
        order = crops[np.argsort(probabilities)[::-1]]
        top = order[:TOP]
        # The app's "to sow this season" list: the field crops the district really sows in this season,
        # ordered by probability times the crop's share of that season's sowing (as app/main.py)
        sown_here = field_crops[(field_crops["State"] == "Karnataka") & (field_crops["Stats_District"] == district)
                                & (field_crops["Season"] == season)].set_index("Crop")["Share"]
        score = {c: p * sown_here[c] for c, p in zip(crops, probabilities) if c not in YEAR_ROUND and c in sown_here}
        sow = sorted(score, key=score.get, reverse=True)[:TOP]
        survey = des[(des["District"] == district) & (des["Season"] == season) & ~des["Crop"].isin(YEAR_ROUND)]
        des_top = list(survey.nlargest(TOP, "Area_ha")["Crop"])
        main_crop = real.sort_values("Share", ascending=False).iloc[0]["Crop"]
        sown = real[~real["Crop"].isin(YEAR_ROUND)].sort_values("Share", ascending=False)
        main_sown = sown.iloc[0]["Crop"] if len(sown) else None
        grown = set(real["Crop"])

        rows.append({
            "season": season,
            "district": district,
            "sample_points": len(in_district),
            "model_top3": ", ".join(top),
            "really_grown_most": main_crop,
            "main_crop_in_top3": main_crop in top,
            "all_top3_grown_here": all(crop in grown for crop in top),
            "sow_list": ", ".join(sow),
            "biggest_sown_crop": main_sown,
            "biggest_sown_crop_in_sow_list": main_sown in sow if main_sown else None,
            "des_top3": ", ".join(des_top),
            "des_biggest_in_sow_list": des_top[0] in sow if des_top else None,
            "des_top3_shared": len(set(sow) & set(des_top)) if des_top else None,
        })
        mark = "ok  " if main_crop in top else "MISS"
        print(f"{mark} {district:18s} model: {', '.join(top):45s} really: {main_crop:16s} "
              f"| to sow: {', '.join(sow):40s} really sown most: {str(main_sown):14s} | DES: {', '.join(des_top)}")

result = pd.DataFrame(rows)
result.to_csv("artifacts/district_check.csv", index=False)
print()
for season, checked in result.groupby("season", sort=False):
    print(f"{season:7s} districts checked: {len(checked)} | main crop inside the top 3: "
          f"{checked['main_crop_in_top3'].sum()} | all three really grown there then: {checked['all_top3_grown_here'].sum()}")
    with_sown = checked.dropna(subset=["biggest_sown_crop"])
    print(f"        'to sow' list has the biggest sown crop: {int(with_sown['biggest_sown_crop_in_sow_list'].sum())} of {len(with_sown)}")
    with_des = checked.dropna(subset=["des_biggest_in_sow_list"])
    print(f"        against the crop survey (DES): biggest crop in the list {int(with_des['des_biggest_in_sow_list'].sum())} "
          f"of {len(with_des)}, {with_des['des_top3_shared'].mean():.1f} of its top 3 in the list on average")
print("Saved artifacts/district_check.csv")
