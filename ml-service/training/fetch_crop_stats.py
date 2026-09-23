# Downloads real district-wise crop area statistics for all of India from data.gov.in
# ("District-wise, season-wise crop production statistics from 1997",
#  Ministry of Agriculture & Farmers Welfare / Directorate of Economics and Statistics).
#
# Needs DATA_GOV_API_KEY in ml-service/.env
# Run from the ml-service folder:  python training/fetch_crop_stats.py

import json
import time
import urllib.request
import pandas as pd

RESOURCE_ID = "35be999b-0208-4354-b557-f6ca9a5355de"
OUT_FILE = "data/raw/india_crop_stats.csv"
PAGE_SIZE = 1000


def read_api_key():
    with open(".env") as f:
        for line in f:
            if line.startswith("DATA_GOV_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise Exception("DATA_GOV_API_KEY not found in ml-service/.env")


def download(url):
    # The server rejects Python's default User-Agent, and sometimes fails for a moment, so try 3 times
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(request, timeout=120))
        except Exception as err:
            print("  retrying after error:", err)
            time.sleep(10)
    raise Exception("Download failed 3 times")


api_key = read_api_key()
records = []
offset = 0

while True:
    url = (
        f"https://api.data.gov.in/resource/{RESOURCE_ID}"
        f"?api-key={api_key}&format=json&limit={PAGE_SIZE}&offset={offset}"
    )
    page = download(url)
    records += page["records"]
    print(f"Downloaded {len(records)} of {page['total']}")
    if len(page["records"]) < PAGE_SIZE:
        break
    offset += PAGE_SIZE

df = pd.DataFrame(records).rename(columns={
    "state_name": "State",
    "district_name": "District",
    "crop_year": "Year",
    "season": "Season",
    "crop": "Crop",
    "area_": "Area_ha",
    "production_": "Production_t",
})
df.to_csv(OUT_FILE, index=False)
print("Saved", OUT_FILE)
