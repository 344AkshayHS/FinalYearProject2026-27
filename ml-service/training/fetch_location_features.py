# Builds soil + climate features for real locations in every district.
#
# Karnataka comes first and gets more points (it is the app's main region):
#   - Karnataka: every taluk from backend/data/karnataka_taluks.geojson, 10 points each, because its
#     crop labels are per taluk (Agriculture Census, see training/fetch_taluk_crops.py)
#   - Other states: backend/data/india_districts.geojson, 10 points per district
# A Karnataka point keeps the district name of backend/data/karnataka_districts.geojson in "District";
# its taluk is looked up again from the point itself (training/taluks.py) wherever it is needed.
#
# For each taluk or district:
#   1. pick random points inside its boundary (fixed seed, so it is repeatable)
#   2. soil for each point from ISRIC SoilGrids   (app/soilgrids.py - same code the app uses)
#   3. climate for each point from NASA POWER      (app/climate.py   - same code the app uses)
#   4. height and steepness from Open-Meteo        (app/terrain.py   - same code the app uses)
# Points with no soil data (water, city centre) are replaced by another random point.
#
# Progress is saved after every taluk or district, so if it stops you can run it again and it
# continues where it left off. Raising the numbers below and running it again tops every
# place up to the new number: points already measured are kept, only the missing ones
# are fetched.
#
# Run from the ml-service folder:  PYTHONPATH=. python training/fetch_location_features.py
# (PowerShell: $env:PYTHONPATH="."; python training/fetch_location_features.py)

import csv
import json
import os
import random
import threading
from concurrent.futures import ThreadPoolExecutor

from app.climate import get_climate
from app.soilgrids import get_soil
from app.terrain import get_terrain
from taluks import DISTRICTS, MISSING, TALUKS, district_at, inside_district, taluk_at

INDIA_FILE = "../backend/data/india_districts.geojson"
OUT_FILE = "data/raw/india_location_features.csv"
TALUK_POINTS = 10    # per Karnataka taluk
OTHER_POINTS = 10    # per district in other states
COLUMNS = [
    "State", "District", "Latitude", "Longitude",
    "pH", "Nitrogen", "Organic_Carbon", "Clay", "Sand", "CEC",
    "Temperature", "Winter_Temperature", "Humidity", "Rainfall", "Monsoon_Rain_Share",
    "Post_Monsoon_Rain_Share", "Dry_Months", "Max_Temperature", "Solar_Radiation",
    "Elevation", "Slope",
]


def random_points(polygons, seed, how_many):
    # Random points inside the district: pick inside the bounding box, keep those inside the boundary
    corners = [c for polygon in polygons for c in polygon[0]]
    west, east = min(c[0] for c in corners), max(c[0] for c in corners)
    south, north = min(c[1] for c in corners), max(c[1] for c in corners)
    rng = random.Random(seed)
    found = 0
    for _ in range(5000):
        lng, lat = rng.uniform(west, east), rng.uniform(south, north)
        if inside_district(lng, lat, polygons):
            yield round(lat, 4), round(lng, 4)
            found += 1
            if found == how_many:
                return


def load_districts(file, read_props, points):
    districts = []
    for feature in json.load(open(file, encoding="utf-8"))["features"]:
        geometry = feature["geometry"]
        state, district, seed = read_props(feature["properties"])
        districts.append({
            "state": state,
            "district": district,
            "key": district,
            "tries": 3,
            "seed": seed,
            "points": points,
            "polygons": [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"],
        })
    return districts


def taluk_label(taluk):
    return f"{taluk['district']} / {taluk['taluk']}"


def karnataka_taluks():
    # Indi has no shape of its own: its points are drawn in Vijayapura district and kept only when
    # they fall outside every drawn taluk (see training/taluks.py)
    jobs = []
    for taluk in TALUKS + list(MISSING.values()):
        polygons = taluk.get("polygons") or next(d["polygons"] for d in DISTRICTS if d["district"] == taluk["district"])
        jobs.append({"state": "Karnataka", "key": taluk_label(taluk), "district": None, "tries": 30,
                     "seed": taluk["district_code"] * 1000 + taluk["taluk_codes"][0],
                     "points": TALUK_POINTS, "polygons": polygons})
    return jobs


def district_rows(job):
    rows = []
    need = job["points"] - len(job["already"])
    # Try up to 3x as many random points as we need, since some have no soil data. Karnataka taluks
    # may try more: a point outside the taluk costs nothing, and Indi's are drawn from its whole district.
    for lat, lng in random_points(job["polygons"], job["seed"], job["points"] * job["tries"]):
        if (lat, lng) in job["already"]:
            continue   # measured on an earlier run
        district = job["district"]
        if job["state"] == "Karnataka":
            taluk, boundary = taluk_at(lat, lng), district_at(lat, lng)
            if taluk is None or boundary is None or taluk_label(taluk) != job["key"]:
                continue   # on a border where the taluk and district maps disagree, or in another taluk
            district = boundary["boundary_name"]
        try:
            soil = get_soil(lat, lng)
            if soil is None:
                continue   # no soil data here, try another point
            climate = get_climate(lat, lng)
            terrain = get_terrain(lat, lng)
        except Exception as err:
            print(f"  skipped point ({lat}, {lng}): {err}")
            continue
        rows.append({"State": job["state"], "District": district,
                     "Latitude": lat, "Longitude": lng, **soil, **climate, **terrain})
        if len(rows) == need:
            break
    return rows


others = [d for d in load_districts(INDIA_FILE, lambda p: (p["NAME_1"], p["NAME_2"], p["ID_2"]), OTHER_POINTS)
          if d["state"] != "Karnataka"]
jobs = karnataka_taluks() + others   # Karnataka first

# Resume: remember the points each taluk or district already has, and fetch only the missing ones.
# Karnataka points are counted for the taluk they are in (points from before the taluk version included).
measured = {}
if os.path.exists(OUT_FILE):
    with open(OUT_FILE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lat, lng = float(row["Latitude"]), float(row["Longitude"])
            key = row["District"]
            if row["State"] == "Karnataka":
                taluk = taluk_at(lat, lng)
                key = taluk_label(taluk) if taluk else None
            measured.setdefault((row["State"], key), set()).add((lat, lng))
else:
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, COLUMNS).writeheader()

for job in jobs:
    job["already"] = measured.get((job["state"], job["key"]), set())

todo = [job for job in jobs if len(job["already"]) < job["points"]]
missing = sum(job["points"] - len(job["already"]) for job in todo)
print(f"{len(jobs)} taluks and districts, {sum(len(m) for m in measured.values())} points already measured, "
      f"{missing} to fetch in {len(todo)} places")

write_lock = threading.Lock()


def process(job):
    rows = district_rows(job)
    if not rows:
        print(f"{job['key']}, {job['state']}: no new points (will retry on next run)")
        return
    with write_lock:
        with open(OUT_FILE, "a", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, COLUMNS).writerows(rows)
    print(f"{job['key']}, {job['state']}: +{len(rows)} points "
          f"({len(job['already']) + len(rows)} of {job['points']})")


# Two places at a time (each soil lookup already makes 18 requests in parallel)
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(process, todo))

print("Finished:", OUT_FILE)
