# Height above sea level and steepness of a GPS point, from the Open-Meteo elevation API
# (Copernicus DEM, 90 m). Free, no API key. Used by both training and the live app, so the
# model always sees terrain calculated the same way.
#
# Steepness is measured the usual way for a height map: read the height a little to the north,
# south, east and west of the point, and see how fast the land rises or falls.

import json
import math
import time
import urllib.request

STEP = 0.005          # about 550 m around the point
METRES_PER_DEGREE = 111_320


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "GreenRoot/1.0"})
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(request, timeout=30))
        except Exception as err:
            print("  Elevation API error:", err, "- retrying")
            time.sleep(2)
    raise Exception("Elevation request failed 3 times")


def get_terrain(lat, lng):
    # One request for 5 heights: the point itself, then north, south, east and west of it
    around = [(lat, lng), (lat + STEP, lng), (lat - STEP, lng), (lat, lng + STEP), (lat, lng - STEP)]
    latitudes = ",".join(str(round(a, 5)) for a, _ in around)
    longitudes = ",".join(str(round(b, 5)) for _, b in around)
    heights = download(f"https://api.open-meteo.com/v1/elevation?latitude={latitudes}&longitude={longitudes}")["elevation"]
    here, north, south, east, west = heights

    rise_north = (north - south) / (2 * STEP * METRES_PER_DEGREE)
    rise_east = (east - west) / (2 * STEP * METRES_PER_DEGREE * math.cos(math.radians(lat)))
    return {
        "Elevation": round(float(here), 1),                                             # metres above sea level
        "Slope": round(math.degrees(math.atan(math.hypot(rise_north, rise_east))), 2),   # degrees
    }
