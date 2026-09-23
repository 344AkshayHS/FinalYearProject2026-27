# Builds soil + climate features for real locations in every district.
#
# Karnataka comes first and gets more points (it is the app's main region):
#   - Karnataka: 30 districts from backend/data/karnataka_districts.geojson, 24 points each
#   - Other states: backend/data/india_districts.geojson, 10 points each
#
# For each district:
#   1. pick random points inside the district boundary (fixed seed, so it is repeatable)
#   2. soil for each point from ISRIC SoilGrids   (app/soilgrids.py - same code the app uses)
#   3. climate for each point from NASA POWER      (app/climate.py   - same code the app uses)
#   4. height and steepness from Open-Meteo        (app/terrain.py   - same code the app uses)
# Points with no soil data (water, city centre) are replaced by another random point.
#
# Progress is saved after every district, so if it stops you can run it again and it
# continues where it left off. Raising the numbers below and running it again tops every
# district up to the new number: points already measured are kept, only the missing ones
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

KARNATAKA_FILE = "../backend/data/karnataka_districts.geojson"
INDIA_FILE = "../backend/data/india_districts.geojson"
OUT_FILE = "data/raw/india_location_features.csv"
KARNATAKA_POINTS = 24
OTHER_POINTS = 10
COLUMNS = [
    "State", "District", "Latitude", "Longitude",
    "pH", "Nitrogen", "Organic_Carbon", "Clay", "Sand", "CEC",
    "Temperature", "Winter_Temperature", "Humidity", "Rainfall", "Monsoon_Rain_Share",
    "Post_Monsoon_Rain_Share", "Dry_Months", "Max_Temperature", "Solar_Radiation",
    "Elevation", "Slope",
]


def inside_ring(lng, lat, ring):
    # Ray casting: count how many edges a line going right from the point crosses
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[j][0], ring[j][1]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
        j = i
    return inside


def inside_district(lng, lat, polygons):
    return any(inside_ring(lng, lat, outer) and not any(inside_ring(lng, lat, h) for h in holes)
               for outer, *holes in polygons)


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
            "seed": seed,
            "points": points,
            "polygons": [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"],
        })
    return districts


def district_rows(job):
    rows = []
    need = job["points"] - len(job["already"])
    # Try up to 3x as many random points as we need, since some have no soil data
    for lat, lng in random_points(job["polygons"], job["seed"], job["points"] * 3):
        if (lat, lng) in job["already"]:
            continue   # measured on an earlier run
        try:
            soil = get_soil(lat, lng)
            if soil is None:
                continue   # no soil data here, try another point
            climate = get_climate(lat, lng)
            terrain = get_terrain(lat, lng)
        except Exception as err:
            print(f"  skipped point ({lat}, {lng}): {err}")
            continue
        rows.append({"State": job["state"], "District": job["district"],
                     "Latitude": lat, "Longitude": lng, **soil, **climate, **terrain})
        if len(rows) == need:
            break
    return rows


karnataka = load_districts(KARNATAKA_FILE, lambda p: ("Karnataka", p["district"], p["censuscode"]), KARNATAKA_POINTS)
others = [d for d in load_districts(INDIA_FILE, lambda p: (p["NAME_1"], p["NAME_2"], p["ID_2"]), OTHER_POINTS)
          if d["state"] != "Karnataka"]
jobs = karnataka + others   # Karnataka first

# Resume: remember the points each district already has, and fetch only the missing ones
measured = {}
if os.path.exists(OUT_FILE):
    with open(OUT_FILE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            place = measured.setdefault((row["State"], row["District"]), set())
            place.add((float(row["Latitude"]), float(row["Longitude"])))
else:
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, COLUMNS).writeheader()

for job in jobs:
    job["already"] = measured.get((job["state"], job["district"]), set())

todo = [job for job in jobs if len(job["already"]) < job["points"]]
missing = sum(job["points"] - len(job["already"]) for job in todo)
print(f"{len(jobs)} districts, {sum(len(m) for m in measured.values())} points already measured, "
      f"{missing} to fetch in {len(todo)} districts")

write_lock = threading.Lock()


def process(job):
    rows = district_rows(job)
    if not rows:
        print(f"{job['district']}, {job['state']}: no new points (will retry on next run)")
        return
    with write_lock:
        with open(OUT_FILE, "a", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, COLUMNS).writerows(rows)
    print(f"{job['district']}, {job['state']}: +{len(rows)} points "
          f"({len(job['already']) + len(rows)} of {job['points']})")


# Two districts at a time (each soil lookup already makes 18 requests in parallel)
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(process, todo))

print("Finished:", OUT_FILE)
