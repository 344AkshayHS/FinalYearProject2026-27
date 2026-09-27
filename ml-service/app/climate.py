# Long-term climate of a GPS point from NASA POWER (20-year climatology, 2001-2020).
# Free, no API key, one light request per point. Used by both training and the live app,
# so the model always sees climate calculated the same way.
#
# get_season_rain: this year's monsoon rain so far against the 2001-2020 average for the same days,
# for the app's "this season" check. Not a model input - the model learns from long-term climate.

import json
import time
import urllib.request
from datetime import date
from functools import lru_cache

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


def daily_rain(lat, lng, start, end):
    """{"YYYYMMDD": mm} from NASA POWER; days not yet published (-999) are left out."""
    url = (
        "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG"
        f"&latitude={lat}&longitude={lng}&start={start}&end={end}&format=JSON"
    )
    values = download(url)["properties"]["parameter"]["PRECTOTCORR"]
    return {day: mm for day, mm in values.items() if mm >= 0}


# IMD's rainfall categories (percent away from normal), the ones its monsoon reports use
def imd_category(percent):
    if percent >= 20:
        return "excess"
    if percent >= -19:
        return "normal"
    if percent >= -59:
        return "deficient"
    return "large_deficient"


# Cached per place (to about 1 km) and day, so repeated checks of one farm ask NASA once. Rounding more
# coarsely would move some points into the next NASA grid cell - near the Western Ghats that changes
# the answer a lot (Mysuru rounded to 0.5 degrees read as Kodagu's heavy rain).
@lru_cache(maxsize=512)
def season_rain_cached(lat, lng, today):
    this_year = daily_rain(lat, lng, f"{today.year}0601", today.strftime("%Y%m%d"))
    if len(this_year) < 7:
        return None   # the first days of June, or NASA has nothing yet
    last = max(this_year)   # NASA publishes a few days late, so compare up to its last day
    window = lambda day: "0601" <= day[4:] <= last[4:]
    per_year = {}
    for day, mm in daily_rain(lat, lng, "20010101", "20201231").items():
        if window(day):
            per_year[day[:4]] = per_year.get(day[:4], 0) + mm
    normal = sum(per_year.values()) / len(per_year)
    rain = sum(this_year.values())
    percent = round((rain / normal - 1) * 100) if normal > 0 else 0
    return {
        "from": f"{today.year}-06-01",
        "to": f"{last[:4]}-{last[4:6]}-{last[6:]}",
        "rain_mm": round(rain),
        "normal_mm": round(normal),          # 2001-2020 average for the same days
        "percent_from_normal": percent,      # e.g. -39 = 39% below normal
        "imd_category": imd_category(percent),
    }


def get_season_rain(lat, lng, today=None):
    """This year's monsoon rain (from 1 June) against normal, or None outside June-November."""
    today = today or date.today()
    if not 6 <= today.month <= 11:
        return None   # before the monsoon there is no season to judge yet
    return season_rain_cached(round(lat, 2), round(lng, 2), today)
