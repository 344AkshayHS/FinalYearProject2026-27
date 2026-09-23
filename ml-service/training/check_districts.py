# Checks every Karnataka district: does the model's top 3 contain the crop farmers really grow most?
#
# This is the question a visitor asks first - "pick my district and see if it is right" - so it is
# worth answering for all 30 districts at once, before a demonstration.
#
# For each district it takes the reference point the app uses when a district is chosen by hand
# (data/district_points.json in the backend), reads that point's features out of the training data,
# and compares the model's top 3 with the district's real crop shares from the statistics.
#
# It needs no server and no internet: the model file and the data files are enough.
# Run from the ml-service folder:  python training/check_districts.py

import json

import joblib
import numpy as np
import pandas as pd

TOP = 3

model = joblib.load("artifacts/crop_model.joblib")
FEATURES = list(model.feature_names_in_)
crops = np.array(model.classes_)

points = pd.read_csv("data/processed/india_dataset.csv")
points = points[points["State"] == "Karnataka"].drop_duplicates(["Latitude", "Longitude"])
shares = pd.read_csv("data/processed/district_crop_share.csv")
shares = shares[shares["State"] == "Karnataka"]

district_points = json.load(open("../backend/data/district_points.json"))


def nearest_point(district):
    """The sample point closest to the spot the app uses for this district."""
    here = district_points.get(district)
    if here is None:
        return None
    in_district = points[points["Stats_District"] == district]
    if in_district.empty:
        return None
    distance = (in_district["Latitude"] - here["lat"]) ** 2 + (in_district["Longitude"] - here["lng"]) ** 2
    return in_district.loc[distance.idxmin()]


rows = []
for district in sorted(shares["Stats_District"].unique()):
    point = nearest_point(district)
    if point is None:
        print(f"{district:18s} no sample point - skipped")
        continue

    probabilities = model.predict_proba(pd.DataFrame([point[FEATURES]])[FEATURES])[0]
    top = crops[np.argsort(probabilities)[::-1][:TOP]]

    real = shares[shares["Stats_District"] == district].sort_values("Share", ascending=False)
    main_crop = real.iloc[0]["Crop"]
    grown = set(real["Crop"])

    rows.append({
        "district": district,
        "model_top3": ", ".join(top),
        "really_grown_most": main_crop,
        "main_crop_in_top3": main_crop in top,
        "all_top3_grown_here": all(crop in grown for crop in top),
    })
    mark = "ok  " if main_crop in top else "MISS"
    print(f"{mark} {district:18s} model: {', '.join(top):45s} really: {main_crop}")

result = pd.DataFrame(rows)
result.to_csv("artifacts/district_check.csv", index=False)
print(f"\nDistricts checked: {len(result)}")
print(f"Main crop inside the model's top 3: {result['main_crop_in_top3'].sum()} of {len(result)}")
print(f"All three suggestions really grown there: {result['all_top3_grown_here'].sum()} of {len(result)}")
print("Saved artifacts/district_check.csv")
