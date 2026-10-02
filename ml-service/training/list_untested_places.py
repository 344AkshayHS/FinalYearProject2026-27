# Lists the districts where we read soil and climate at sample points but have no crop statistics.
# The model still answers there (from the soil and climate of the exact spot), but its answer could not be
# tested against what farmers really grow, so the apps tell the farmer so.
#
# Reads: data/raw/india_location_features.csv (every sample point) and data/processed/india_dataset.csv (the
# points that got crop labels). Writes: ../backend/data/untested_places.json, which the backend reads.
# The names are those of the all-India district map (old state names such as Orissa are cleaned by the backend).
#
# No training: it only compares the two files. Run from the ml-service folder:
#   python training/list_untested_places.py

import json

import pandas as pd

OUT_FILE = "../backend/data/untested_places.json"

features = pd.read_csv("data/raw/india_location_features.csv")
labelled_points = pd.read_csv("data/processed/india_dataset.csv", usecols=["Latitude", "Longitude"])
labelled = set(zip(labelled_points["Latitude"], labelled_points["Longitude"]))

has_labels = [(lat, lng) in labelled for lat, lng in zip(features["Latitude"], features["Longitude"])]
untested = features.loc[[not has for has in has_labels], ["State", "District"]].drop_duplicates()
untested = untested.sort_values(["State", "District"])

places = [{"state": state, "district": district} for state, district in zip(untested["State"], untested["District"])]
with open(OUT_FILE, "w", encoding="utf-8") as file:
    json.dump(places, file, indent=1, ensure_ascii=False)

print(f"{len(places)} districts without crop statistics, saved to {OUT_FILE}")
print(untested.groupby("State")["District"].apply(lambda names: ", ".join(names)).to_string())
