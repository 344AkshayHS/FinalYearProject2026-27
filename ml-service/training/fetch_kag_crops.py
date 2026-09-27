# Crop area for every Karnataka taluk from Karnataka At A Glance (KAG): the Karnataka Directorate of
# Economics and Statistics' figures per taluk (https://kgis.ksrsac.in/kag), for 2019-20 to 2021-22.
# Its map service answers one crop for all taluks in one request, so this takes about a minute.
#
# Two uses in build_dataset.py:
#   - cowpea and field bean (avare): the Agriculture Census (training/fetch_taluk_crops.py) has no row
#     for them, so without KAG the model could never learn them in Karnataka;
#   - the other 30 crops KAG counts: three more (and newer) years beside the two census years, which
#     steadies crops whose area swings from year to year (chickpea, for one).
# KAG does not count coffee or the spices separately; those stay census-only.
#
# KAG uses today's taluks (about 234 since the 2018 changes), our labels use the 176 of Census 2011.
# Each of today's taluks is placed in the Census 2011 taluk that contains its centre, using the KGIS
# taluk map (downloaded here) and training/taluks.py. Areas are added up per Census 2011 taluk, with
# the total sown area.
#
# Output: data/raw/karnataka_kag_crops.csv - Year, Place (our taluk key), Crop, Area_ha, where Crop
# "all crops" is KAG's total area sown.
#
# Run from the ml-service folder:  python training/fetch_kag_crops.py

import csv
import io
import json
import re
import urllib.request
import zipfile

from taluks import taluk_at, taluk_key

SERVICE = "https://kgis.ksrsac.in/kag/KAG_Kgis.asmx/classbreakRenderer"
TALUK_MAP = "https://kgis.ksrsac.in/kgisdocuments/PDF_KML_SHP/Taluk/KML/Taluk.zip"
OUT_FILE = "data/raw/karnataka_kag_crops.csv"
YEARS = ["2019-20", "2020-21", "2021-22"]
# KAG layer number (the number in its layer list) -> our crop name; "all crops" = total area sown
LAYERS = {
    "170": "all crops",
    "190": "rice", "191": "jowar", "192": "bajra", "193": "maize", "194": "ragi", "195": "wheat",
    "198": "pigeonpea (tur)", "199": "horse gram", "200": "black gram", "201": "green gram",
    "202": "field bean (avare)", "203": "cowpea", "204": "chickpea",
    "210": "groundnut", "211": "sunflower", "213": "castor", "214": "sesame", "215": "niger seed",
    "216": "soybean", "217": "linseed",
    "220": "cotton", "221": "sugarcane", "222": "tobacco", "222c": "coconut", "222d": "arecanut",
    "219a": "banana", "219b": "mango", "219f": "grapes", "219h": "pomegranate", "219m": "tomato",
    "219v": "onion", "219ad": "potato",
}


def kag_layer(layer, year):
    """{KGIS taluk code: hectares} for one KAG layer and year."""
    body = json.dumps({"distcode": "Taluk", "Table_Name": "DSOD", "column_Name": layer, "Column_alias": layer,
                       "Year": year, "DistrictCode": "", "getFilterType": ""}).encode()
    request = urllib.request.Request(SERVICE, body, {"Content-Type": "application/json; charset=utf-8",
                                                     "User-Agent": "Mozilla/5.0"})
    rows = json.loads(json.loads(urllib.request.urlopen(request, timeout=120).read())["d"])
    return {row["TalukCode"]: float(row["Value"] or 0) for row in rows}


def taluk_centres():
    """{KGIS taluk code: (lat, lng)}: the area-weighted centre of each of today's taluks."""
    request = urllib.request.Request(TALUK_MAP, headers={"User-Agent": "Mozilla/5.0"})
    outer = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(request, timeout=300).read()))
    kmz = zipfile.ZipFile(io.BytesIO(outer.read(outer.namelist()[0])))
    kml = kmz.read("doc.kml").decode("utf-8", "replace")
    centres = {}
    for placemark in re.findall(r"<Placemark.*?</Placemark>", kml, flags=re.S):
        code = re.search(r"<td>KGISTalukCode</td>\s*<td>(\d+)</td>", placemark).group(1)
        best = None
        for ring in re.findall(r"<outerBoundaryIs>.*?<coordinates>(.*?)</coordinates>", placemark, flags=re.S):
            points = [tuple(map(float, p.split(",")[:2])) for p in ring.split()]
            # shoelace formula: signed area and centroid of the ring; the biggest ring is the taluk itself
            area = cx = cy = 0.0
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                cross = x1 * y2 - x2 * y1
                area += cross
                cx += (x1 + x2) * cross
                cy += (y1 + y2) * cross
            if area and (best is None or abs(area) > abs(best[0])):
                best = (area, cy / (3 * area), cx / (3 * area))
        centres[code] = (best[1], best[2])
    return centres


centres = taluk_centres()
place_of = {}
for code, (lat, lng) in centres.items():
    taluk = taluk_at(lat, lng)
    if taluk:
        place_of[code] = taluk_key(taluk)
print(f"Today's taluks on the KGIS map: {len(centres)} | placed in a Census 2011 taluk: {len(place_of)}")

rows, unplaced = [], set()
for year in YEARS:
    for layer, crop in LAYERS.items():
        totals = {}
        for code, hectares in kag_layer(layer, year).items():
            if code not in place_of:
                unplaced.add(code)
                continue
            totals[place_of[code]] = totals.get(place_of[code], 0) + hectares
        rows += [[year, place, crop, round(hectares, 1)] for place, hectares in sorted(totals.items())]
        print(f"{year} {crop:18s}: {len(totals)} Census 2011 taluks, {round(sum(totals.values())):,} ha")

with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["Year", "Place", "Crop", "Area_ha"])
    writer.writerows(rows)
print(f"Saved {OUT_FILE}: {len(rows)} rows")
if unplaced:
    print("KAG taluk codes not on the KGIS map (left out):", sorted(unplaced))
