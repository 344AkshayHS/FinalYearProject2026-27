# Reads topsoil (0-30 cm) properties for one GPS point from ISRIC SoilGrids v2.0.
# Uses exactly the same layers, depths, units and averaging as training/fetch_location_features.py.

import io
import urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

# SoilGrids layer -> (our name, divide by this to get normal units)
SOIL_LAYERS = {
    "phh2o": ("pH", 10),
    "nitrogen": ("Nitrogen", 100),
    "soc": ("Organic_Carbon", 10),
    "clay": ("Clay", 10),
    "sand": ("Sand", 10),
    "cec": ("CEC", 10),
}
DEPTHS = {"0-5cm": 5, "5-15cm": 10, "15-30cm": 15}   # depth -> thickness in cm
BOX = 0.01   # small area around the point (about 1 km)


def read_layer(layer, depth, lat, lng):
    # Downloads a small map of one layer around the point and averages the pixels within about 500 m
    west, east, south, north = lng - BOX, lng + BOX, lat - BOX, lat + BOX
    url = (
        f"https://maps.isric.org/mapserv?map=/map/{layer}.map&SERVICE=WCS&VERSION=2.0.1"
        f"&REQUEST=GetCoverage&COVERAGEID={layer}_{depth}_mean&FORMAT=image/tiff"
        f"&SUBSET=long({west},{east})&SUBSET=lat({south},{north})"
        "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
        "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(request, timeout=60).read()
    pixels = np.array(Image.open(io.BytesIO(data))).astype(float)
    pixels[pixels <= 0] = np.nan   # 0 means "no data"

    rows, cols = pixels.shape
    r, c = rows // 2, cols // 2
    window = pixels[max(r - 2, 0): r + 3, max(c - 2, 0): c + 3]
    return np.nan if np.all(np.isnan(window)) else np.nanmean(window)


def get_soil(lat, lng):
    # 6 layers x 3 depths = 18 small downloads, done at the same time
    jobs = [(layer, depth) for layer in SOIL_LAYERS for depth in DEPTHS]
    with ThreadPoolExecutor(max_workers=18) as pool:
        values = list(pool.map(lambda job: read_layer(job[0], job[1], lat, lng), jobs))
    by_job = dict(zip(jobs, values))

    soil = {}
    for layer, (name, divide_by) in SOIL_LAYERS.items():
        total = sum(by_job[(layer, depth)] * cm for depth, cm in DEPTHS.items())
        value = total / sum(DEPTHS.values()) / divide_by
        if np.isnan(value):
            return None   # no soil data here (sea, city centre, water body)
        soil[name] = round(float(value), 2)
    return soil
