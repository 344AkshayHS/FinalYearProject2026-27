# What each Karnataka taluk sows in each season, for ordering its "to sow this season" list:
#
#   artifacts/taluk_season_crops.csv  - per taluk shape and season: every field crop's share of the taluk's
#       field crops in that season (read by the ML service)
#
# A crop's share of the taluk's land in an Agriculture Census year (2010-11, 2015-16), times the part of that
# crop's land its district sows in the season (crop survey, DES 2022-23; Karnataka's where the district has
# none), then averaged over the census years. Year-round crops are left out: the list is of field crops.
#
# Checked on districts the model never saw, scoring each census year with the other year's shares (so the
# ordering never sees the year it is scored on): the taluk's main crop came first 68% of the time with the
# model's probability times these shares, against 58% with the district's crop survey shares and 49% with
# the model alone (954 taluk seasons; top 3: 91%, 88%, 84%).
#
# Run from the ml-service folder:  python training/taluk_season_crops.py

import json

import pandas as pd

from taluks import MISSING, TALUKS, taluk_key

CENSUS_FILE = "data/raw/karnataka_taluk_crop_area.csv"
DES_FILE = "data/raw/karnataka_des_season_area.csv"
OUT_FILE = "artifacts/taluk_season_crops.csv"
YEAR_ROUND = set(json.load(open("artifacts/crop_model_info.json"))["year_round"])
SEASONS = ["Kharif", "Rabi", "Summer"]

des = pd.read_csv(DES_FILE)
by_district = des.groupby(["District", "Crop", "Season"])["Area_ha"].sum().unstack("Season", fill_value=0)
by_district = by_district.div(by_district.sum(axis=1), axis=0)
by_state = des.groupby(["Crop", "Season"])["Area_ha"].sum().unstack("Season", fill_value=0)
by_state = by_state.div(by_state.sum(axis=1), axis=0)


def season_part(district, crop, season):
    """The part of a crop's land its district sows in this season, else Karnataka's; None when DES has no figures."""
    if (district, crop) in by_district.index:
        return by_district.loc[(district, crop)].get(season, 0)
    if crop in by_state.index:
        return by_state.loc[crop].get(season, 0)
    return None


def census_shares():
    """Each crop's share of its taluk shape's cropped land, per census year (as build_dataset.py reads it)."""
    census = pd.read_csv(CENSUS_FILE)
    shape_of = {(t["district_code"], code): taluk_key(t) for t in TALUKS + list(MISSING.values()) for code in t["taluk_codes"]}
    census["Place"] = [shape_of.get((d, t)) for d, t in zip(census["District_code"], census["Taluk_code"])]
    census["Crop"] = census["Crop"].fillna("all crops")
    census = census.dropna(subset=["Place"]).groupby(["Place", "Crop", "Year"], as_index=False)["Area_ha"].sum()
    total = census[census["Crop"] == "all crops"].set_index(["Place", "Year"])["Area_ha"]
    crops = census[census["Crop"] != "all crops"].copy()
    crops["Share"] = crops["Area_ha"] / [total.get((p, y)) for p, y in zip(crops["Place"], crops["Year"])]
    return crops[crops["Share"] > 0]


def season_shares(shares):
    """shares (Place, Year, Crop, Share) -> (Place, Year, Season, Crop, Share): each season's field crops, adding to 1."""
    district_of = {taluk_key(t): t["district"] for t in TALUKS + list(MISSING.values())}
    field = shares[~shares["Crop"].isin(YEAR_ROUND)]
    rows = []
    for place, year, crop, share in field[["Place", "Year", "Crop", "Share"]].values:
        for season in SEASONS:
            part = season_part(district_of[place], crop, season)
            if part:
                rows.append((place, year, season, crop, share * part))
    table = pd.DataFrame(rows, columns=["Place", "Year", "Season", "Crop", "Share"])
    table["Share"] = table["Share"] / table.groupby(["Place", "Year", "Season"])["Share"].transform("sum")
    return table


if __name__ == "__main__":
    yearly = season_shares(census_shares())
    # Averaged over the census years; a crop missing in one year counts as 0 there
    years = yearly.groupby(["Place", "Season"])["Year"].transform("nunique")
    yearly["Share"] = yearly["Share"] / years
    table = yearly.groupby(["Place", "Season", "Crop"], as_index=False)["Share"].sum()
    table["Share"] = table["Share"].round(4)
    table.to_csv(OUT_FILE, index=False)
    print(f"Saved {OUT_FILE}: {table['Place'].nunique()} taluks, {len(table)} rows")
