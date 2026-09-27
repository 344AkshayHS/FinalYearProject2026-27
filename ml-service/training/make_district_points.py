# Writes artifacts/karnataka_district_points.csv: every Karnataka sample point with its district, its
# taluk and its features. It is used when a user picks their district (and maybe a taluk) by hand
# instead of sharing GPS: the ML service averages the model over all points of the chosen district or
# taluk, so the answer stands for the whole area, not one spot in it.
#
# Taluk is the key used everywhere for Karnataka taluks ("district code:taluk codes", see
# training/taluks.py); it is empty for the few points the taluk map cannot place. Census says whether
# the taluk has Agriculture Census figures (without them a picked taluk is answered for its district).
# Every sample point already has SoilGrids data (fetch_location_features.py only keeps those).
#
# Run from the ml-service folder (after fetch_location_features.py):
#   python training/make_district_points.py

import json
import pandas as pd

from taluks import district_name, taluk_at, taluk_key

POINTS_FILE = "artifacts/karnataka_district_points.csv"
# The land's features only: the ML service adds the season to each question
FEATURES = [f for f in json.load(open("artifacts/crop_model_info.json"))["features"] if f != "Season"]

points = pd.read_csv("data/raw/india_location_features.csv")
points = points[points["State"] == "Karnataka"].copy()
points["District"] = points["District"].map(district_name)
found = [taluk_at(lat, lng) for lat, lng in zip(points["Latitude"], points["Longitude"])]
points["Taluk"] = [taluk_key(t) if t else "" for t in found]
points["Census"] = points["Taluk"].isin(set(pd.read_csv("data/processed/taluk_crop_share.csv")["Place"]))
points[["District", "Taluk", "Census", "Latitude", "Longitude"] + FEATURES].to_csv(POINTS_FILE, index=False)

print(f"Saved {len(points)} points to {POINTS_FILE}: {points['District'].nunique()} districts, "
      f"{points.loc[points['Taluk'] != '', 'Taluk'].nunique()} taluks "
      f"({points.loc[points['Census'], 'Taluk'].nunique()} with census figures), "
      f"{(points['Taluk'] == '').sum()} points without a taluk")
