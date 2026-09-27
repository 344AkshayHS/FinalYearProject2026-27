# Builds backend/data/karnataka_taluks.geojson: one shape per Karnataka taluk, labelled with the
# Agriculture Census district and taluk codes (the codes in data/raw/karnataka_taluk_crop_area.csv).
#
# Shapes: Census 2011 sub-district boundaries, from github.com/datta07/INDIAN-SHAPEFILES (MIT licence).
# Census 2011 has the same 176 taluks as the Agriculture Census 2010-11 and 2015-16, so the two match,
# with two gaps in the shape file (checked on the map):
#   - Aland has no shape of its own: the shape called "Afzalpur" covers Afzalpur and Aland together
#     (it reaches Aland town). That shape keeps both census taluks, and their crop areas are added up.
#   - Indi has no shape at all: it is a hole in Vijayapura district. It is the district's only missing
#     taluk, so a point inside the district but outside every drawn taluk belongs to it; the file lists
#     it under "missing_taluks" for that rule.
# Every shape therefore carries a list of census taluk codes ("taluk_codes"), usually just one.
#
# Run from the ml-service folder:  python training/make_taluk_map.py

import difflib
import json
import re
import urllib.request

SHAPES_URL = ("https://raw.githubusercontent.com/datta07/INDIAN-SHAPEFILES/master/"
              "STATES/KARNATAKA/KARNATAKA_SUBDISTRICTS.geojson")
CENSUS = "https://agcensus.da.gov.in/TalukCharacteristics.aspx/"
OUT_FILE = "../backend/data/karnataka_taluks.geojson"
DISTRICT_NAMES = json.load(open("../backend/data/karnataka_district_names.json"))

# Census district spellings our alias file does not know yet -> names in our crop statistics
CENSUS_DISTRICTS = {
    "VIJAPURA": "BIJAPUR", "KALABURGI": "GULBARGA", "UTTRA KANNADA": "UTTAR KANNAD",
    "CHIKKAMAGALUR": "CHIKMAGALUR", "BENGALURU (U )": "BENGALURU URBAN", "BENGALURU (R )": "BANGALORE RURAL",
    "RAMANAGAR": "RAMANAGARA", "CHICHBALLAPURA": "CHIKBALLAPUR",
}

# Census taluk -> shape name, where the spelling is too different to match automatically (checked by hand).
# Bailhongal and Saundatti were called Sampgaon and Parasgad in Census 2011.
TALUK_SHAPES = {
    ("BELGAUM", "BAILHONGAL"): "Sampgaon", ("BELGAUM", "SOUNDATTI"): "Parasgad",
    ("CHIKMAGALUR", "N.R. PURA"): "Narasimharajapura", ("CHIKBALLAPUR", "CHICHBALLAPURA"): "Chikkaballapura",
    ("MANDYA", "K.R. PET"): "Krishnarajpet", ("MYSORE", "H.D. KOTE"): "Heggadadevankote",
    ("MYSORE", "K.R. NAGARA"): "Krishnarajanagara", ("MYSORE", "T. NARASIPURA"): "Tirumakudal - Narsipur",
}
SHARED_SHAPE = {("GULBARGA", "ALAND"): "Afzalpur"}   # census taluk -> the shape it shares
NO_SHAPE = {("BIJAPUR", "INDI")}                      # the hole described above


def clean(name):
    return re.sub(r"[^a-z]", "", name.lower())


def our_district(name):
    if name in CENSUS_DISTRICTS:
        return CENSUS_DISTRICTS[name]
    for district, aliases in DISTRICT_NAMES.items():
        if clean(name) in {clean(a) for a in aliases + [district]}:
            return district
    raise Exception(f"unknown district name: {name}")


def census_taluks():
    def call(method, payload):
        request = urllib.request.Request(CENSUS + method, payload.encode(), {
            "Content-Type": "application/json; charset=utf-8", "User-Agent": "Mozilla/5.0"})
        return json.loads(urllib.request.urlopen(request, timeout=120).read().decode())["d"]

    districts = call("getDistrict", "{'value':'8a','Text':'KARNATAKA','CallFor':'State','year':'2015'}")["District"]
    for code, name in (d.split(",", 1) for d in districts.split("|")):
        tehsils = call("getTehsil", "{'value':'%s','Text':'%s','CallFor':'District','stcdu':'8a','year':'2015'}"
                       % (code, name))["Tehsil"]
        for taluk_code, taluk in (t.split(",", 1) for t in tehsils.split("|") if "," in t):
            yield {"district": our_district(name), "district_code": int(code),
                   "taluk": taluk.strip(), "taluk_codes": [int(taluk_code)]}


def tidy(ring):
    # 4 decimals is about 10 m - plenty for taluk borders, and it makes the file far smaller
    points = []
    for lng, lat in ring:
        point = [round(lng, 4), round(lat, 4)]
        if not points or point != points[-1]:
            points.append(point)
    return points


shapes = json.load(urllib.request.urlopen(SHAPES_URL, timeout=300))["features"]
by_district = {}
for shape in shapes:
    by_district.setdefault(our_district(shape["properties"]["dtname"]), []).append(shape)

features, missing, shared, used = [], [], [], set()
for taluk in census_taluks():
    candidates = {s["properties"]["sdtname"]: s for s in by_district[taluk["district"]]}
    if (taluk["district"], taluk["taluk"]) in NO_SHAPE:
        missing.append(taluk)
        continue
    if (taluk["district"], taluk["taluk"]) in SHARED_SHAPE:
        shared.append(taluk)
        continue
    name = TALUK_SHAPES.get((taluk["district"], taluk["taluk"]))
    if name is None:
        by_clean = {clean(n): n for n in candidates}
        close = difflib.get_close_matches(clean(taluk["taluk"]), list(by_clean), n=1, cutoff=0.75)
        if not close:
            raise Exception(f"no shape for {taluk['taluk']} ({taluk['district']})")
        name = by_clean[close[0]]
        if clean(name) != clean(taluk["taluk"]):
            print(f"  matched by spelling: {taluk['taluk']:22s} -> {name}")
    if name in used:
        raise Exception(f"{name} matched twice")
    used.add(name)
    geometry = candidates[name]["geometry"]
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    features.append({
        "type": "Feature",
        "properties": {**taluk, "census_2011_name": name},
        "geometry": {"type": "MultiPolygon", "coordinates": [[tidy(r) for r in p] for p in polygons]},
    })

for taluk in shared:
    shape = next(f["properties"] for f in features if f["properties"]["district"] == taluk["district"]
                 and f["properties"]["census_2011_name"] == SHARED_SHAPE[(taluk["district"], taluk["taluk"])])
    shape["taluk"] += " + " + taluk["taluk"]
    shape["taluk_codes"] += taluk["taluk_codes"]

unused = [s["properties"]["sdtname"] for s in shapes if s["properties"]["sdtname"] not in used]
if unused:
    raise Exception(f"shapes with no census taluk: {unused}")
if len({t["district"] for t in missing}) != len(missing):
    raise Exception("a district has more than one taluk without a shape - the hole rule would not work")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "missing_taluks": missing, "features": features}, f, separators=(",", ":"))

print(f"Saved {OUT_FILE}: {len(features)} taluk shapes")
print("Sharing a shape:", [f["properties"]["taluk"] for f in features if len(f["properties"]["taluk_codes"]) > 1])
print("Without a shape (a hole in their district):", [f"{t['taluk']} ({t['district']})" for t in missing])
