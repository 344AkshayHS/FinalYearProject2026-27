# Long-term climate of a GPS point from NASA POWER (20-year climatology, 2001-2020).
# Free, no API key, one light request per point. Used by both training and the live app,
# so the model always sees climate calculated the same way.

import json
import time
import urllib.request

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MONSOON = ["JUN", "JUL", "AUG", "SEP"]
POST_MONSOON = ["OCT", "NOV", "DEC"]
WINTER = ["DEC", "JAN", "FEB"]
DRY_MONTH_MM = 50   # a month with less than this much rain needs irrigation to grow a crop


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "GreenRoot/1.0"})
    # A normal answer takes 5-15 seconds; a request that hangs is usually faster to retry than to wait for
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(request, timeout=30))
        except Exception as err:
            print("  NASA POWER error:", err, "- retrying")
            time.sleep(2)
    raise Exception("NASA POWER request failed 3 times")


def get_climate(lat, lng):
    url = (
        "https://power.larc.nasa.gov/api/temporal/climatology/point"
        "?parameters=T2M,RH2M,PRECTOTCORR,T2M_MAX,ALLSKY_SFC_SW_DWN"
        f"&community=AG&latitude={lat}&longitude={lng}&format=JSON"
    )
    data = download(url)["properties"]["parameter"]
    temp, humidity, rain_per_day = data["T2M"], data["RH2M"], data["PRECTOTCORR"]
    hottest, sunlight = data["T2M_MAX"], data["ALLSKY_SFC_SW_DWN"]

    # NASA gives rain as mm/day for each month; turn it into mm per month
    rain = {m: rain_per_day[m] * days for m, days in zip(MONTHS, DAYS_IN_MONTH)}
    yearly_rain = sum(rain.values())

    return {
        "Temperature": round(temp["ANN"], 2),                                # °C, yearly average
        "Winter_Temperature": round(sum(temp[m] for m in WINTER) / 3, 2),   # °C, Dec-Feb average
        "Humidity": round(humidity["ANN"], 2),                              # %
        "Rainfall": round(yearly_rain, 1),                                  # mm per year
        "Monsoon_Rain_Share": round(sum(rain[m] for m in MONSOON) / yearly_rain, 3),  # 0-1
        # Karnataka's second rains (Oct-Dec) decide the rabi crop in the east of the state
        "Post_Monsoon_Rain_Share": round(sum(rain[m] for m in POST_MONSOON) / yearly_rain, 3),  # 0-1
        "Dry_Months": sum(1 for m in MONTHS if rain[m] < DRY_MONTH_MM),      # months under 50 mm
        "Max_Temperature": round(max(hottest[m] for m in MONTHS), 2),       # °C, hottest month's daily high
        "Solar_Radiation": round(sunlight["ANN"], 2),                       # kWh/m² per day, yearly average
    }
