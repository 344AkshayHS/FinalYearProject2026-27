"""Small copies of the photo each crop shows in lists (the Crops tab, crop thumbnails), in crop-images/small/.

A list tile is about 160 points wide, so it needs no 800 px photo: a 360 px copy is about 22 KB instead of about
110 KB, and a slow phone with little memory opens 121 of them easily. The crop's own page still shows the full
photos. The backend gives the app a photo's small copy when one is here (backend/src/services/crop-photos.js).

The photo shown in lists is the first one in this order, the same as PHOTO_ORDER in frontend/src/lib/crops.ts.
Run again after adding or changing photos:  python crop-images/make_small.py
"""

import json
import os

from PIL import Image

FOLDER = os.path.dirname(os.path.abspath(__file__))
SMALL = os.path.join(FOLDER, "small")
ORDER = ["seeds", "field", "close_up", "pods", "mature"]
SIDE = 360  # the longest side, in pixels

with open(os.path.join(FOLDER, "crops.json"), encoding="utf-8") as f:
    crops = json.load(f)

made = 0
for crop, item in crops.items():
    photos = [image for image in item["images"] if image.get("file") and os.path.exists(os.path.join(FOLDER, image["file"]))]
    photos.sort(key=lambda image: ORDER.index(image["slot"]))
    if not photos:
        continue
    file = photos[0]["file"]
    out = os.path.join(SMALL, file)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with Image.open(os.path.join(FOLDER, file)) as photo:
        photo = photo.convert("RGB")
        photo.thumbnail((SIDE, SIDE), Image.LANCZOS)
        photo.save(out, "JPEG", quality=72, optimize=True, progressive=True)
    made += 1

print(f"{made} small photos in {SMALL}")
