# GreenRoot ML service.
#
#   GET  /soil?lat=..&lng=..     -> topsoil values for that point (ISRIC SoilGrids)
#   GET  /climate?lat=..&lng=..  -> 20-year climate for that point (NASA POWER)
#   GET  /terrain?lat=..&lng=..  -> height above sea level and steepness (Open-Meteo elevation)
#   GET  /season_rain?lat=..&lng=.. -> this monsoon's rain so far against normal (NASA POWER), IMD category
#   GET  /report                 -> training results for the admin dashboard (app/report.py)
#   POST /predict                -> top 5 crops, the 90% confident set, SHAP + LIME for the top crop,
#                                   and how often a top crop with this probability was right in testing
#                                   ("season": Kharif, Rabi or Summer; the season of today's date if left out),
#                                   and "season_sown_share": how much of the district's field crops is sown then,
#                                   and "sow_this_season": the top 3 field crops the district sows then
#   POST /predict_district       -> the same for a Karnataka district (or one of its taluks) picked by
#                                   hand: the model averaged over all the area's sample points
#
# Needs the files made by the training scripts (see training/ folder).
# Run from the ml-service folder:  uvicorn app.main:app --env-file .env --port 8000

import json
from datetime import date
from typing import Literal

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from lime.lime_tabular import LimeTabularExplainer
from pydantic import BaseModel

from app.climate import get_climate, get_season_rain
from app.report import build_report
from app.soilgrids import get_soil
from app.suitability import check, moved_down, other_crops
from app.terrain import get_terrain

model = joblib.load("artifacts/crop_model.joblib")
model_info = json.load(open("artifacts/crop_model_info.json"))
FEATURES = model_info["features"]
SEASONS = model_info["seasons"]   # the model's "Season" input: {"Kharif": 1, "Rabi": 2, "Summer": 3}
LAND_FEATURES = [f for f in FEATURES if f != "Season"]
# Plantation crops and fruit trees stand in the field all year; the season's field crops are listed apart
YEAR_ROUND = set(model_info["year_round"])
crops = list(model.classes_)
confident_threshold = model_info["conformal"]["threshold"]
# How often the top crop was really the area's main crop, per range of its probability (training/calibration.py)
top_crop_reliability = json.load(open("artifacts/calibration.json"))["top_crop_reliability"]
# Every Karnataka sample point with its features, for district answers (training/make_district_points.py)
district_points = pd.read_csv("artifacts/karnataka_district_points.csv", keep_default_na=False)
# How much a picked taluk's own points count against its district's, measured on held-out districts
# (training/compare_taluk_labels.py). A taluk sits inside its district, so the district backs it up.
TALUK_WEIGHT = json.load(open("artifacts/taluk_weight.json"))["taluk_weight"]
# How each sample point's district divides its field crops between the seasons (training/build_dataset.py):
# where a season sows little (summer in most districts), the app says so beside the model's crops
sown_share = pd.read_csv("artifacts/season_sown_share.csv")
# IMD's normal yearly rainfall per district (training/read_imd_rainfall.py), for checking crops' rainfall needs:
# real millimetres, where NASA's coarse grid reads twice the rain in some districts near the Western Ghats
district_rain = pd.read_csv("artifacts/district_rainfall.csv").set_index(["Stats_State", "Stats_District"]).to_dict("index")
# The field crops each district really sows in each season, with their share of that season's field crops
# (1% or more; Karnataka from its crop survey, training/build_dataset.py)
sown_crops = {key: dict(zip(rows["Crop"], rows["Share"])) for key, rows in
              pd.read_csv("artifacts/season_field_crops.csv").groupby(["State", "Stats_District", "Season"])}
# What each Karnataka taluk sows in each season: its field crops' shares (census, split into seasons by the
# crop survey; training/taluk_season_crops.py), to order a taluk's "to sow" list by its own crops
taluk_crops = {key: dict(zip(rows["Crop"], rows["Share"])) for key, rows in
               pd.read_csv("artifacts/taluk_season_crops.csv").groupby(["Place", "Season"])}

shap_explainer = shap.TreeExplainer(model)   # exact and fast for Random Forest
lime_explainer = LimeTabularExplainer(
    pd.read_csv("artifacts/lime_sample.csv")[FEATURES].values,
    feature_names=FEATURES,
    class_names=crops,
    discretize_continuous=False,
    random_state=42,
)

app = FastAPI(title="GreenRoot ML Service")


class Features(BaseModel):
    pH: float
    Nitrogen: float
    Organic_Carbon: float
    Clay: float
    Sand: float
    CEC: float
    Temperature: float
    Winter_Temperature: float
    Humidity: float
    Rainfall: float
    Monsoon_Rain_Share: float
    Post_Monsoon_Rain_Share: float
    Dry_Months: int
    Max_Temperature: float
    Solar_Radiation: float
    Elevation: float
    Slope: float
    season: Literal["Kharif", "Rabi", "Summer"] | None = None
    lat: float | None = None               # the farm, for the season's sown share of its district
    lng: float | None = None
    own_ph: bool = False                   # pH is from the farmer's own soil test, not the soil map
    taluk: str | None = None               # the farm's Karnataka taluk key, e.g. "26:3", found by the backend


class District(BaseModel):
    district: str                          # as spelled in our crop statistics, e.g. "MYSORE"
    taluk: str | None = None               # optional taluk key, e.g. "26:3" (training/taluks.py)
    season: Literal["Kharif", "Rabi", "Summer"] | None = None
    pH: float | None = None                # the farmer's own soil test, if given
    Organic_Carbon: float | None = None


@app.get("/")
def home():
    return {"status": "ML service is running", "model": model_info["model_version"]}


@app.get("/report")
def report():
    return build_report(model, FEATURES)


@app.get("/soil")
def soil(lat: float, lng: float):
    result = get_soil(lat, lng)
    if result is None:
        raise HTTPException(status_code=404, detail="no_soil_data")
    return result


@app.get("/climate")
def climate(lat: float, lng: float):
    return get_climate(lat, lng)


@app.get("/terrain")
def terrain(lat: float, lng: float):
    return get_terrain(lat, lng)


@app.get("/season_rain")
def season_rain(lat: float, lng: float):
    # null outside June-November, or when NASA has no data for this season yet
    return get_season_rain(lat, lng)


def season_now():
    # The season a farmer plans for now: kharif is sown with the monsoon (June to September), rabi after
    # it (October to January), and the summer crop from February to May
    month = date.today().month
    if 6 <= month <= 9:
        return "Kharif"
    return "Rabi" if month >= 10 or month == 1 else "Summer"


def nearest_district(lat, lng):
    """The statistics district of the sample point nearest the farm (a row of season_sown_share), or None
    when no point is within about 50 km."""
    if lat is None or lng is None:
        return None
    distance = (sown_share["Latitude"] - lat) ** 2 + ((sown_share["Longitude"] - lng) * np.cos(np.radians(lat))) ** 2
    return sown_share.loc[distance.idxmin()] if distance.min() < 0.45 ** 2 else None


def normal_rain(district):
    """IMD's normal rain for the district: {"Rain_mm": year, "Kharif_mm": .., "Rabi_mm": .., "Summer_mm": ..}"""
    return district_rain.get((district["Stats_State"], district["Stats_District"])) if district is not None else None


def add_season_facts(result, probabilities, district, season, row, own_ph, taluk=None):
    """What the farm's district (nearest_district) really sows in this season:
      - season_sown_share: the share of the district's field crops sown in this season;
      - sow_this_season: the top 3 field crops (not year-round ones) among those the district really sows
        in this season - Chikkamagaluru sows no rabi rice, so rice is never on its rabi list. In Karnataka they
        are ordered by the model's probability times the crop's share of the sowing that season: the taluk's
        own crops (census) where the taluk has census figures, else the district's (crop survey). On taluks
        the model never saw, scored on a census year the ordering did not use, the taluk's main crop came
        first 68% of the time with the taluk's crops, 58% with the district's and 49% with the model alone."""
    result["season_sown_share"] = float(district[season]) if district is not None else None
    sown_here = sown_crops.get((district["Stats_State"], district["Stats_District"], season)) if district is not None else None
    in_karnataka = district is not None and district["Stats_State"] == "Karnataka" and sown_here is not None
    suits = {item["crop"]: item["suits"] for item in result["all_crops"]}
    field_crops = [i for i in range(len(crops)) if crops[i] not in YEAR_ROUND and (sown_here is None or crops[i] in sown_here)
                   and not moved_down(suits[crops[i]], own_ph)]
    grown_here = taluk_crops.get((taluk, season)) if in_karnataka else None
    result["sow_order"] = "taluk" if grown_here else "district" if in_karnataka else "model"
    if grown_here:
        # a crop the taluk's census does not count goes after the ones it does, in the model's order
        field_crops = sorted(field_crops, key=lambda i: (-probabilities[i] * grown_here.get(crops[i], 0), -probabilities[i]))[:3]
    else:
        field_crops = sorted(field_crops, key=lambda i: -probabilities[i] * (sown_here[crops[i]] if in_karnataka else 1))[:3]
    result["sow_this_season"] = [{"crop": crops[i], "probability": round(float(probabilities[i]), 5),
                                  # share of the district's field crops sown in this season (Karnataka: crop survey)
                                  "district_share": round(float(sown_here[crops[i]]), 3) if sown_here else None,
                                  # the same in the taluk (census), when the taluk's crops ordered the list
                                  "taluk_share": round(float(grown_here.get(crops[i], 0)), 3) if grown_here else None}
                                 for i in field_crops]
    # "What grows best on this land" and "what to sow this season" are two questions: when the list above
    # starts with another crop than the model's top one - the top crop stands all year (arecanut, coconut,
    # coffee), or the taluk's own crops put another first (tobacco in Hunsur) - the season's headline is the
    # list's first crop, explained on its own; a year-round top crop is still shown, as the land's best one
    result["season_best"] = None
    if field_crops and crops[field_crops[0]] != result["recommendations"][0]["crop"]:
        index = field_crops[0]
        probability = float(probabilities[index])
        shap_values, lime_values = explain(row, index)
        result["season_best"] = {
            "crop": crops[index], "probability": round(probability, 5), "score": round(probability * 100, 1),
            "confident": bool(1 - probability <= confident_threshold), "shap": shap_values, "lime": lime_values,
            "suits": suits[crops[index]], "reliability": reliability(probability),
            "district_share": result["sow_this_season"][0]["district_share"],
        }
    return result


def reliability(probability):
    for row in top_crop_reliability:
        if row["from"] < probability <= row["to"]:
            return row["main_crop_rate"]
    return top_crop_reliability[-1]["main_crop_rate"]


def predict_table(values):
    # LIME passes plain number arrays; the model was trained on a table with column names
    return model.predict_proba(pd.DataFrame(values, columns=FEATURES))


@app.post("/predict")
def predict(features: Features):
    season = features.season or season_now()
    row = pd.DataFrame([features.model_dump()])[LAND_FEATURES].assign(Season=SEASONS[season])[FEATURES]
    probabilities = model.predict_proba(row)[0]
    district = nearest_district(features.lat, features.lng)
    result = answer(probabilities, row, season, features.own_ph, normal_rain(district))
    return add_season_facts(result, probabilities, district, season, row, features.own_ph, features.taluk)


@app.post("/predict_district")
def predict_district(request: District):
    in_district = district_points[district_points["District"] == request.district]
    points = in_district[in_district["Taluk"] == request.taluk] if request.taluk else in_district
    if points.empty:
        raise HTTPException(status_code=404, detail="unknown_area")

    season = request.season or season_now()

    def features_and_average(area):
        rows = area[LAND_FEATURES].assign(Season=SEASONS[season])[FEATURES]
        # The farmer's soil test describes their own farm, so it replaces the soil map everywhere
        for feature in ("pH", "Organic_Carbon"):
            if getattr(request, feature) is not None:
                rows[feature] = getattr(request, feature)
        return rows, model.predict_proba(rows).mean(axis=0)

    # The answer: the model averaged over every point of the area
    rows, probabilities = features_and_average(points)
    taluk_weight = None
    if request.taluk:
        # A picked taluk leans on its district by the measured weight. Without census figures the model
        # knows no more about the taluk than about its district, so the district's answer is used.
        taluk_weight = TALUK_WEIGHT if points["Census"].iloc[0] else 0.0
        probabilities = taluk_weight * probabilities + (1 - taluk_weight) * features_and_average(in_district)[1]

    # SHAP takes about 2 s per point, so the explanation is for the area's typical land instead:
    # the median of its points
    typical = rows.median().to_frame().T[FEATURES]
    typical["Dry_Months"] = typical["Dry_Months"].round()
    # A real place to save with the request and to read rainfall for: the point nearest the area's middle
    middle = ((points["Latitude"] - points["Latitude"].mean()) ** 2 + (points["Longitude"] - points["Longitude"].mean()) ** 2).idxmin()
    centre = {"lat": float(points.at[middle, "Latitude"]), "lng": float(points.at[middle, "Longitude"])}
    district = nearest_district(centre["lat"], centre["lng"])
    result = answer(probabilities, typical, season, request.pH is not None, normal_rain(district))
    result["typical_features"] = {f: round(float(typical[f].iloc[0]), 3) for f in FEATURES}
    result["sample_points"] = len(rows)
    # Picked taluk: how much its own points counted (the rest is its district); None for a district
    result["taluk_weight"] = taluk_weight
    result["centre"] = centre
    return add_season_facts(result, probabilities, district, season, typical, request.pH is not None, request.taluk)


def explain(row, index):
    """SHAP and LIME weights of every feature for one crop at this row of features."""
    shap_values = shap_explainer.shap_values(row)[0][:, index]
    lime_result = lime_explainer.explain_instance(
        row.values[0], predict_table, labels=(index,), num_features=len(FEATURES), num_samples=500
    )
    return ({f: round(float(v), 4) for f, v in zip(FEATURES, shap_values)},
            {f: round(float(w), 4) for f, w in lime_result.as_list(label=index)})


def answer(probabilities, row, season, own_ph=False, rain=None):
    """Top 5 crops for these probabilities, with SHAP and LIME for the top crop at this row of features, how
    the land suits each crop (FAO EcoCrop requirements, app/suitability.py), every crop in order, and the
    herbs, spices and plantation crops the model does not know that suit the land."""
    land = row.iloc[0].copy()
    if rain is not None:   # the district's IMD normal rainfall for the requirement checks (the model keeps NASA's)
        land["Rainfall"] = rain["Rain_mm"]
        land["Season_Rain"] = rain[f"{season}_mm"]
    else:                  # NASA's: the monsoon (June-September) and post-monsoon (October-December) shares
        share = {"Kharif": land["Monsoon_Rain_Share"], "Rabi": land["Post_Monsoon_Rain_Share"]}.get(
            season, 1 - land["Monsoon_Rain_Share"] - land["Post_Monsoon_Rain_Share"])
        land["Season_Rain"] = land["Rainfall"] * share
    suits = {crop: check(crop, land, season) for crop in crops}
    # Crops the land cannot grow by their requirements go below the others (see app/suitability.py)
    order = sorted(np.argsort(probabilities)[::-1], key=lambda i: moved_down(suits[crops[i]], own_ph))

    # Explain the top crop only, to keep the response fast
    top = order[0]
    shap_values, lime_values = explain(row, top)

    recommendations = []
    for rank, index in enumerate(order[:5]):
        probability = float(probabilities[index])
        recommendations.append({
            "crop": crops[index],
            "probability": round(probability, 5),
            "score": round(probability * 100, 1),
            # Rule 3: is this crop inside the 90% conformal prediction set?
            "confident": bool(1 - probability <= confident_threshold),
            "shap": shap_values if rank == 0 else None,
            "lime": lime_values if rank == 0 else None,
            "suits": suits[crops[index]],
        })

    return {
        "model_version": model_info["model_version"],
        "season": season,
        "recommendations": recommendations,
        # every crop the model knows, in the same order, for "See all crops"
        "all_crops": [{"crop": crops[i], "probability": round(float(probabilities[i]), 5), "suits": suits[crops[i]]}
                      for i in order],
        "other_crops": other_crops(land, season),
        # the yearly rainfall the crops' rainfall needs were checked against, and where it comes from
        "rain_checked_mm": round(float(land["Rainfall"])),
        "rain_source": "IMD district normal 1951-2000" if rain is not None else "NASA POWER 2001-2020",
        "top_crop_reliability": reliability(float(probabilities[top])),
    }

