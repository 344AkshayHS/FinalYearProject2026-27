# Picks one reference farm point per Karnataka district, used when a user chooses their
# district by hand instead of sharing GPS. Output: backend/data/district_points.json
#
# The point is the sample point nearest the middle of the district's sample points.
# Every sample point already has SoilGrids data (fetch_location_features.py only keeps those).
#
# Run from the ml-service folder (after fetch_location_features.py):
#   python training/make_district_points.py

import json
import pandas as pd

OUT_FILE = "../backend/data/district_points.json"
KARNATAKA_NAMES = json.load(open("../backend/data/karnataka_district_names.json"))


def dataset_name(boundary_name):
    cleaned = boundary_name.lower().strip()
    return next((d for d, aliases in KARNATAKA_NAMES.items() if cleaned in aliases), None)


points = pd.read_csv("data/raw/india_location_features.csv")
points = points[points["State"] == "Karnataka"]

result = {}
for district, rows in points.groupby("District"):
    centre_lat, centre_lng = rows["Latitude"].mean(), rows["Longitude"].mean()
    nearest = rows.loc[((rows["Latitude"] - centre_lat) ** 2 + (rows["Longitude"] - centre_lng) ** 2).idxmin()]
    result[dataset_name(district)] = {"lat": float(nearest["Latitude"]), "lng": float(nearest["Longitude"])}

missing = set(KARNATAKA_NAMES) - set(result)
with open(OUT_FILE, "w") as f:
    json.dump(dict(sorted(result.items())), f, indent=2)
print(f"Saved {len(result)} districts to {OUT_FILE}. Missing: {sorted(missing) or 'none'}")
