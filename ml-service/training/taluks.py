# Which Karnataka taluk is a point in? Shared by the training scripts that need taluks.
#
# Uses backend/data/karnataka_taluks.geojson (made by training/make_taluk_map.py). Indi has no shape
# there, so a point inside Vijayapura district but outside every drawn taluk belongs to it. The district
# is checked with backend/data/karnataka_districts.geojson, the same boundaries the rest of the training uses.

import json

TALUK_FILE = "../backend/data/karnataka_taluks.geojson"
DISTRICT_FILE = "../backend/data/karnataka_districts.geojson"
DISTRICT_NAMES = json.load(open("../backend/data/karnataka_district_names.json"))


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


def taluk_key(taluk):
    # One map shape can hold two census taluks (Afzalpur + Aland), so the key lists every code: "4:2+1"
    return f"{taluk['district_code']}:" + "+".join(str(code) for code in taluk["taluk_codes"])


def polygons_of(geometry):
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def district_name(boundary_name):
    cleaned = boundary_name.lower().strip()
    for district, aliases in DISTRICT_NAMES.items():
        if cleaned in aliases:
            return district
    return None


taluk_map = json.load(open(TALUK_FILE, encoding="utf-8"))
TALUKS = [{**f["properties"], "polygons": polygons_of(f["geometry"])} for f in taluk_map["features"]]
MISSING = {t["district"]: t for t in taluk_map["missing_taluks"]}
DISTRICTS = [{"district": district_name(f["properties"]["district"]), "boundary_name": f["properties"]["district"],
              "polygons": polygons_of(f["geometry"])}
             for f in json.load(open(DISTRICT_FILE, encoding="utf-8"))["features"]]


def district_at(lat, lng):
    """The Karnataka district boundary this point is in, or None."""
    return next((d for d in DISTRICTS if inside_district(lng, lat, d["polygons"])), None)


def taluk_at(lat, lng):
    """The census taluk ({district, district_code, taluk, taluk_codes}) at this point, or None."""
    for taluk in TALUKS:
        if inside_district(lng, lat, taluk["polygons"]):
            return {k: v for k, v in taluk.items() if k != "polygons"}
    district = district_at(lat, lng)
    return MISSING.get(district["district"]) if district else None
