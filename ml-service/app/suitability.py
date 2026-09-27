# Checks crops against their FAO EcoCrop requirements (artifacts/crop_requirements.csv, made by
# training/read_ecocrop.py): soil pH, temperature, rainfall and soil texture of the land being checked.
#
# For each value a crop is "good" (inside its optimal range), "possible" (inside its absolute range) or
# "unsuited" (outside it). Checked on every place and season where our statistics say a crop is really grown
# (training/check_requirements.py): outside the absolute temperature range is almost never wrong (0% of real
# crops in Karnataka, 2.2% in India) and outside the absolute pH range rarely (3%), so only those two move a
# crop down the list - and pH only when it comes from the farmer's own soil test, since the soil map is an
# estimate too. Rainfall is only shown (irrigation makes 15% of real crops "unsuited" by rain alone), and
# so is the optimal range (a third of real crops grow outside their optimal pH).

import json
import math

import pandas as pd

requirements = pd.read_csv("artifacts/crop_requirements.csv").set_index("Crop")
YEAR_ROUND = set(json.load(open("artifacts/crop_model_info.json"))["year_round"])

RABI = "Rabi"


def number(value):
    return None if pd.isna(value) else float(value)


def texture_class(clay, sand):
    # EcoCrop's texture words: heavy (clayey), light (sandy), medium (loamy in between)
    if clay >= 35:
        return "heavy"
    return "light" if sand >= 65 and clay < 20 else "medium"


def rate(value, low_opt, high_opt, low, high):
    if any(isinstance(x, float) and math.isnan(x) for x in (low, high)):
        return None
    if low_opt <= value <= high_opt:
        return "good"
    return "possible" if low <= value <= high else "unsuited"


def rate_texture(texture, optimal, allowed):
    words = lambda text: set(str(text).replace(" ", "").split(",")) if isinstance(text, str) else set()
    if "wide" in words(optimal) or texture in words(optimal):
        return "good"
    return "possible" if "wide" in words(allowed) or texture in words(allowed) else "unsuited"


def seasonal(crop):
    """A crop sown and harvested within a season (rice, pulses, vegetables): its EcoCrop rainfall need is for
    its own growing months, so it is checked against the season's rain; plantation crops, fruit trees and
    perennial herbs against the year's."""
    r = requirements.loc[crop]
    if r.In_model:
        return crop not in YEAR_ROUND
    return r.Group == "vegetable" or (r.Group == "herb" and "perennial" not in str(r.Life_span))


def check(crop, land, season):
    """How the land suits a crop: {"ph": .., "temperature": .., "rain": .., "texture": .., "fertility": ..,
    "needs": {...}} or None for a crop without requirements. land: the model's features of the land.
    The season's temperature is the winter one in rabi, the yearly mean otherwise."""
    if crop not in requirements.index:
        return None
    r = requirements.loc[crop]
    temperature = land["Winter_Temperature"] if season == RABI else land["Temperature"]
    # land["Season_Rain"]: the season's normal rain (IMD, or NASA's share of the year's rain where IMD has none)
    rain = land["Season_Rain"] if seasonal(crop) and "Season_Rain" in land else land["Rainfall"]
    return {
        "ph": rate(land["pH"], r.pH_opt_min, r.pH_opt_max, r.pH_min, r.pH_max),
        "temperature": rate(temperature, r.Temp_opt_min, r.Temp_opt_max, r.Temp_min, r.Temp_max),
        "rain": rate(rain, r.Rain_opt_min, r.Rain_opt_max, r.Rain_min, r.Rain_max),
        "rain_mm": round(float(rain)),                     # the rain it was checked against
        "rain_is_season": bool(seasonal(crop) and "Season_Rain" in land),
        "texture": rate_texture(texture_class(land["Clay"], land["Sand"]), r.Texture_opt, r.Texture),
        "fertility": r.Fertility if isinstance(r.Fertility, str) else None,   # low / moderate / high need
        # the optimal ranges, to show the farmer what the crop needs (null where EcoCrop has no figure)
        "needs": {"ph": [number(r.pH_opt_min), number(r.pH_opt_max)],
                  "rain_mm": [number(r.Rain_opt_min), number(r.Rain_opt_max)],
                  "temperature_c": [number(r.Temp_opt_min), number(r.Temp_opt_max)]},
    }


def moved_down(suits, own_ph):
    # outside the absolute temperature range, or outside the absolute pH range of the farmer's own soil test
    return suits is not None and (suits["temperature"] == "unsuited" or (own_ph and suits["ph"] == "unsuited"))


def other_crops(land, season):
    """Vegetables, herbs, spices and plantation crops the model does not know, that suit the land by their
    requirements: pH and the season's temperature inside their absolute range, and rain too - except that a
    seasonal crop (vegetables, annual herbs) with too little rain stays, since it can be irrigated; the app hides
    those on rain-fed land. Too much rain, or too little for a plantation crop or tree, cannot be watered away.
    The most "good" values first."""
    suited = []
    for crop, row in requirements[~requirements["In_model"]].iterrows():
        suits = check(crop, land, season)
        values = [suits[k] for k in ("ph", "temperature", "rain", "texture")]
        if "unsuited" in values[:2] or None in values[:2]:
            continue
        too_dry_for_irrigating = suits["rain"] == "unsuited" and seasonal(crop) and suits["rain_mm"] < row.Rain_min
        if suits["rain"] in ("unsuited", None) and not too_dry_for_irrigating:
            continue
        suited.append({"crop": crop, "group": row.Group, "good": values.count("good"), "suits": suits})
    return sorted(suited, key=lambda item: -item["good"])
