# Writes the app's answer for every Karnataka district and taluk in every season, to read in Excel:
#
#   artifacts/karnataka_recommendations.csv  - per district / taluk and season: the model's top 5 crops, the
#       "to sow this season" list, how much of the district's field crops is sown in that season, what our
#       training statistics say is grown most there, and what the crop survey (DES) says the district sowed
#   artifacts/karnataka_all_crops.csv        - the same places and seasons with every crop's percent
#
# Answers are made the way the ML service makes them for a district or taluk picked by hand: the model
# averaged over the area's sample points; a picked taluk blended with its district by the saved taluk
# weight (the district alone for a taluk without census figures); the "to sow" list limited to field crops
# the district really sows in that season, ordered by the taluk's own crops where it has census figures.
# No soil test is assumed.
#
# Run from the ml-service folder (after the model is trained):  python training/export_recommendations.py

import json

import joblib
import numpy as np
import pandas as pd

from taluks import MISSING, TALUKS, taluk_key

TOP = 5
LITTLE_SOWN = 0.1   # as in the app: below this, "little is sown here in this season"

model = joblib.load("artifacts/crop_model.joblib")
info = json.load(open("artifacts/crop_model_info.json"))
FEATURES, SEASONS, YEAR_ROUND = info["features"], info["seasons"], set(info["year_round"])
LAND_FEATURES = [f for f in FEATURES if f != "Season"]
crops = np.array(model.classes_)
taluk_weight = json.load(open("artifacts/taluk_weight.json"))["taluk_weight"]

points = pd.read_csv("artifacts/karnataka_district_points.csv", keep_default_na=False)
field_crops = pd.read_csv("artifacts/season_field_crops.csv")
field_crops = field_crops[field_crops["State"] == "Karnataka"]
sown_share = pd.read_csv("artifacts/season_sown_share.csv")
sown_share = sown_share[sown_share["Stats_State"] == "Karnataka"].groupby("Stats_District")[list(SEASONS)].first()
des = pd.read_csv("data/raw/karnataka_des_season_area.csv")   # the crop survey (DES), by district and season
district_real = pd.read_csv("data/processed/district_crop_share.csv")
district_real = district_real[district_real["State"] == "Karnataka"]
taluk_real = pd.read_csv("data/processed/taluk_crop_share.csv")
taluk_season = {key: dict(zip(rows["Crop"], rows["Share"])) for key, rows in   # as app/main.py
                pd.read_csv("artifacts/taluk_season_crops.csv").groupby(["Place", "Season"])}
taluk_name = {taluk_key(t): t["taluk"] for t in TALUKS + list(MISSING.values())}
taluk_district = {taluk_key(t): t["district"] for t in TALUKS + list(MISSING.values())}


def average(area, code):
    return model.predict_proba(area[LAND_FEATURES].assign(Season=code)[FEATURES]).mean(axis=0)


def listed(probabilities, chosen):
    return ", ".join(f"{crops[i]} {probabilities[i] * 100:.0f}%" for i in chosen)


def really_grown(shares):
    return ", ".join(f"{c} {s * 100:.0f}%" for c, s in shares.sort_values("Share", ascending=False)[["Crop", "Share"]].values[:3])


summary, every_crop = [], []
for district in sorted(points["District"].unique()):
    in_district = points[points["District"] == district]
    # Each taluk under its own district, as in the app's taluk list (a few border points of a taluk fall in
    # the next district on the district map)
    taluks = [(None, in_district)] + [(key, rows) for key, rows in in_district[in_district["Taluk"] != ""].groupby("Taluk")
                                      if taluk_district.get(key) == district]
    for season, code in SEASONS.items():
        district_average = average(in_district, code)
        sown_here = field_crops[(field_crops["Stats_District"] == district) & (field_crops["Season"] == season)].set_index("Crop")["Share"]
        survey = des[(des["District"] == district) & (des["Season"] == season) & ~des["Crop"].isin(YEAR_ROUND)]
        survey_top = ", ".join(f"{c} {a:,.0f} ha" for c, a in survey.nlargest(3, "Area_ha")[["Crop", "Area_ha"]].values)
        sown = sown_share[season].get(district)
        for key, rows in taluks:
            if key is None:
                probabilities, weight = district_average, None
                real = district_real[(district_real["Stats_District"] == district) & (district_real["Season"] == code)]
            else:
                weight = taluk_weight if rows["Census"].iloc[0] else 0.0
                probabilities = weight * average(rows, code) + (1 - weight) * district_average
                real = taluk_real[(taluk_real["Place"] == key) & (taluk_real["Season"] == code)]
            order = np.argsort(probabilities)[::-1]
            # as app/main.py: probability times the crop's share of the sowing in this season - the taluk's own
            # crops (census) where it has figures, else the district's (crop survey)
            grown_here = taluk_season.get((key, season)) if key is not None else None
            field = [i for i in range(len(crops)) if crops[i] not in YEAR_ROUND and crops[i] in sown_here]
            if grown_here:
                sow = sorted(field, key=lambda i: (-probabilities[i] * grown_here.get(crops[i], 0), -probabilities[i]))[:3]
            else:
                sow = sorted(field, key=lambda i: -probabilities[i] * sown_here[crops[i]])[:3]
            place = {"Level": "district" if key is None else "taluk", "District": district,
                     "Taluk": "" if key is None else taluk_name.get(key, key), "Season": season}
            summary.append({
                **place,
                # the app's headline: the season's first crop to sow (the model's top crop when the list is empty)
                "Best crop to sow (app headline)": crops[sow[0]] if sow else crops[order[0]],
                "Year-round crop that suits the land best": crops[order[0]] if crops[order[0]] in YEAR_ROUND else "",
                "Model top 5": listed(probabilities, order[:TOP]),
                "Year-round crops in top 3": ", ".join(c for c in crops[order[:3]] if c in YEAR_ROUND),
                "To sow this season": listed(probabilities, sow),
                "Share of district's field crops sown this season": None if sown is None else f"{sown * 100:.0f}%",
                "Little sown note shown": bool(sown is not None and sown < LITTLE_SOWN),
                "Really grown most (statistics)": really_grown(real),
                f"Sown most in the district (DES {des['Year'].iloc[0]})": survey_top,
                "Taluk weight": weight,
                "Sample farms": len(rows),
            })
            every_crop.append({**place, **{c: round(p * 100, 1) for c, p in zip(crops, probabilities)}})

pd.DataFrame(summary).to_csv("artifacts/karnataka_recommendations.csv", index=False, encoding="utf-8-sig")
pd.DataFrame(every_crop).to_csv("artifacts/karnataka_all_crops.csv", index=False, encoding="utf-8-sig")
table = pd.DataFrame(summary)
print(f"Saved artifacts/karnataka_recommendations.csv and artifacts/karnataka_all_crops.csv: "
      f"{(table['Level'] == 'district').sum() // len(SEASONS)} districts and {(table['Level'] == 'taluk').sum() // len(SEASONS)} "
      f"taluks x {len(SEASONS)} seasons = {len(table)} rows, {len(crops)} crops")
