# Joins the real crop statistics (labels) with the soil + climate of each sample point (features).
#
# Label for a point = the crop mix of its district, from the government statistics (data.gov.in,
# refreshed with ICRISAT 2015-2019, plus coffee and horticulture from their own official sources):
#   - yearly crop area averaged over 2010-2014
#   - each crop's share of the district's farmed area
#   - crops under 2.5% of a district's area are ignored, and so are crops that
#     reach that share in fewer than 3 districts (too rare to learn)
# Each point gets one row per crop, repeated once per 5% of area share
# (a crop on 40% of the district counts 8 times, one on 5% counts once).
#
# Karnataka points use the crop mix of their TALUK instead, from the Agriculture Census 2010-11 and
# 2015-16 (training/fetch_taluk_crops.py), with the same rules. The census has no cowpea or avare, so
# those two come from Karnataka's DES figures for 2019-22 (training/fetch_kag_crops.py). A crop's share
# is its area over the taluk's cropped area, averaged over every year that reports the crop: the two
# census years and the three DES years for the crops DES counts (only cowpea and avare with --census-only).
# A point the taluk map cannot place (a few sit on borders where the maps disagree) keeps its district's mix.
# The "Place" column says which crop mix a row was labelled with (a taluk or a district).
#
# It also writes backend/data/karnataka_crop_facts.json for the app: the crops really grown most in
# every Karnataka taluk and district, as a share of all their cropped land, and how much of each crop's
# land is irrigated there (census), for the app's "Needs irrigation" mark on rain-fed land.
#
# District names differ between the statistics and the boundary files, so they are matched:
#   - Karnataka: exact, through backend/data/karnataka_district_names.json
#   - other states: same cleaned name, or a very close spelling in the same state
#
# Run from the ml-service folder:  python training/build_dataset.py  [--census-only]

import difflib
import json
import re
import sys

import pandas as pd

from forest import YEAR_ROUND
from taluks import MISSING, TALUKS, taluk_at, taluk_key

YEARS = (2010, 2014)
MIN_SHARE = 0.025
MIN_DISTRICTS = 3
COPIES_PER_SHARE = 20   # 1 row per 5% of area

# Totals and catch-all groups, not single crops. Matched ignoring case and extra spaces, because
# the two sources spell them differently ("Other  Rabi pulses" in data.gov.in, "Other Rabi pulses" in ICRISAT)
NOT_A_CROP = [
    "Total foodgrain", "Oilseeds total", "Pulses total", "other oilseeds", "Other Kharif pulses",
    "Other  Rabi pulses", "Small millets", "Peas & beans (Pulses)", "Other Cereals & Millets",
    "Other Vegetables", "Other Fresh Fruits",
]

# Government crop names -> simple names used in the app (also merges duplicates)
CROP_NAMES = {
    "Paddy": "rice",
    "Arhar/Tur": "pigeonpea (tur)",
    "Gram": "chickpea",
    "Moong(Green Gram)": "green gram",
    "Urad": "black gram",
    "Blackgram": "black gram",
    "Masoor": "lentil",
    "Horse-gram": "horse gram",
    "Cotton(lint)": "cotton",
    "Dry chillies": "chilli",
    "Dry ginger": "ginger",
    "Castor seed": "castor",
    "Cowpea(Lobia)": "cowpea",
    "Rapeseed &Mustard": "mustard",
    "Sesamum": "sesame",
    "Soyabean": "soybean",
    "Guar seed": "guar",
    "Moth": "moth bean",
    "Sannhamp": "sunn hemp",
    "Khesari": "khesari",
    "Pome Granet": "pomegranate",
    "Drum Stick": "drumstick",
    "Pump Kin": "pumpkin",
    "Colocosia": "colocasia",
    "Jack Fruit": "jackfruit",
    "Rajmash Kholar": "rajma",
}

# State names in the boundary file -> names in the statistics
STATE_NAMES = {
    "Orissa": "Odisha",
    "Uttaranchal": "Uttarakhand",
    "Andaman and Nicobar": "Andaman and Nicobar Islands",
}

# Boundary district names spelled differently in the statistics (checked by hand).
# Not listed: Kanpur (split into Kanpur Nagar and Kanpur Dehat in the statistics),
# Manipur and Mizoram (no statistics for 2010-2014), and city districts with no farming data.
DISTRICT_ALIASES = {
    ("Andhra Pradesh", "Cuddapah"): "KADAPA",
    ("Andhra Pradesh", "Nellore"): "SPSR NELLORE",
    ("Assam", "Sibsagar"): "SIVASAGAR",
    ("Assam", "North Cachar Hills"): "DIMA HASAO",
    ("Bihar", "Bhabua"): "KAIMUR (BHABUA)",
    ("Chhattisgarh", "Kawardha"): "KABIRDHAM",
    ("Chhattisgarh", "Koriya"): "KOREA",
    ("Gujarat", "Dahod"): "DOHAD",
    ("Gujarat", "The Dangs"): "DANG",
    ("Jammu and Kashmir", "Anantnag (Kashmir South)"): "ANANTNAG",
    ("Jammu and Kashmir", "Bagdam"): "BADGAM",
    ("Jammu and Kashmir", "Baramula (Kashmir North)"): "BARAMULLA",
    ("Jammu and Kashmir", "Kupwara (Muzaffarabad)"): "KUPWARA",
    ("Jammu and Kashmir", "Ladakh (Leh)"): "LEH LADAKH",
    ("Jammu and Kashmir", "Punch"): "POONCH",
    ("Jharkhand", "Pashchim Singhbhum"): "WEST SINGHBHUM",
    ("Jharkhand", "Purba Singhbhum"): "EAST SINGHBUM",
    ("Madhya Pradesh", "East Nimar"): "KHANDWA",
    ("Madhya Pradesh", "West Nimar"): "KHARGONE",
    ("Maharashtra", "Bid"): "BEED",
    ("Maharashtra", "Raigarh"): "RAIGAD",
    ("Odisha", "Keonjhar"): "KENDUJHAR",
    ("Puducherry", "Puducherry"): "PONDICHERRY",
    ("Rajasthan", "Dhaulpur"): "DHOLPUR",
    ("Sikkim", "North Sikkim"): "NORTH DISTRICT",
    ("Sikkim", "South Sikkim"): "SOUTH DISTRICT",
    ("Sikkim", "West Sikkim"): "WEST DISTRICT",
    ("Tamil Nadu", "Nilgiris"): "THE NILGIRIS",
    ("Tamil Nadu", "Thoothukudi"): "TUTICORIN",
    ("Tamil Nadu", "Tirunelveli Kattabo"): "TIRUNELVELI",
    ("Uttar Pradesh", "Badaun"): "BUDAUN",
    ("Uttar Pradesh", "Jyotiba Phule Nagar"): "AMROHA",
    ("Uttar Pradesh", "Lakhimpur Kheri"): "KHERI",
    ("West Bengal", "Dakshin Dinajpur"): "DINAJPUR DAKSHIN",
    ("West Bengal", "Uttar Dinajpur"): "DINAJPUR UTTAR",
    ("West Bengal", "Darjiling"): "DARJEELING",
    ("West Bengal", "East Midnapore"): "MEDINIPUR EAST",
    ("West Bengal", "West Midnapore"): "MEDINIPUR WEST",
    ("West Bengal", "Haora"): "HOWRAH",
    ("West Bengal", "Hugli"): "HOOGHLY",
    ("West Bengal", "Kochbihar"): "COOCHBEHAR",
    ("West Bengal", "North 24 Parganas"): "24 PARAGANAS NORTH",
    ("West Bengal", "South 24 Parganas"): "24 PARAGANAS SOUTH",
}

KARNATAKA_NAMES = json.load(open("../backend/data/karnataka_district_names.json"))


def clean(name):
    return re.sub(r"[^a-z]", "", name.lower().replace("&", "and").replace("district", ""))


def karnataka_name(boundary_name):
    cleaned = boundary_name.lower().strip()
    for district, aliases in KARNATAKA_NAMES.items():
        if cleaned in aliases:
            return district
    return None


def stats_district_for(state, boundary_name, stats_districts):
    # Which district in the statistics does this boundary polygon belong to?
    if state == "Karnataka":
        return karnataka_name(boundary_name)
    if (state, boundary_name) in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[(state, boundary_name)]
    candidates = stats_districts.get(state, [])
    if state == "Andhra Pradesh":   # Telangana was still part of Andhra Pradesh in the boundary file
        candidates = candidates + stats_districts.get("Telangana", [])
    by_clean = {clean(d): d for d in candidates}
    if clean(boundary_name) in by_clean:
        return by_clean[clean(boundary_name)]
    close = difflib.get_close_matches(clean(boundary_name), list(by_clean), n=1, cutoff=0.85)
    return by_clean[close[0]] if close else None


# ICRISAT writes a few crop and state names differently from the data.gov.in statistics
ICRISAT_CROP_NAMES = {
    "Rapeseed & Mustard": "mustard",
    "Castor": "castor",
    "Nigerseed": "niger seed",
    "Niger seed": "niger seed",
    "Sweet Potato": "sweet potato",
    "Moong": "green gram",
    "Arhar": "pigeonpea (tur)",
}
ICRISAT_STATE_NAMES = {"Orissa": "Odisha"}
ICRISAT_YEARS = (2015, 2019)

SEASONS = {"Kharif": 1, "Rabi": 2, "Summer": 3}   # the codes are the model's "Season" input
# data.gov.in splits rice into autumn and winter crops; both are sown in the kharif season
DATA_GOV_SEASONS = {"Kharif": "Kharif", "Autumn": "Kharif", "Winter": "Kharif", "Rabi": "Rabi", "Summer": "Summer"}
# YEAR_ROUND (training/forest.py): crops that stand in the field through every season, so they count in
# every season. The statistics cannot tell us this: most states file them under "Whole Year", some under "Kharif".
# Crops a state files under "Whole Year" only, whose season is known from the crop board instead of
# falling back to all of India's split (for tobacco that is Andhra Pradesh's rabi crop): Karnataka's
# tobacco (FCV of Mysuru and Hassan, bidi tobacco of Belagavi) is planted from April to July, a kharif crop.
KNOWN_SEASONS = {("Karnataka", "tobacco"): {"Kharif": 1.0, "Rabi": 0.0, "Summer": 0.0}}
# Avare has no season figures of its own. The statistics count it among the "other pulses", recorded as
# "Other Kharif pulses" and "Other Rabi pulses", so avare takes their split in its district. Checked on
# cowpea, which has its own figures: over Karnataka's districts the two splits differ by 0.21 on average
# (0.55 for "every season"), and hardly at all in the southern districts where most avare is grown.
SEASON_LIKE = {"field bean (avare)": ["other kharif pulses", "other rabi pulses"]}

TALUK_AREA_FILE = "data/raw/karnataka_taluk_crop_area.csv"
KAG_FILE = "data/raw/karnataka_kag_crops.csv"
KAG_ONLY_CROPS = ["cowpea", "field bean (avare)"]   # the Agriculture Census does not count these
# KAG's three years (2019-22) also count for every other crop KAG has, beside the two census years:
# five years steady crops whose area swings (chickpea). On held-out districts this beat census-only
# labels on every score (2026-09-24, and again per season 2026-09-25: artifacts/taluk_label_comparison.csv
# vs *_census_only.csv), so it is the default; --census-only builds the other version for such a comparison.
KAG_FOR_ALL_CROPS = "--census-only" not in sys.argv
FACTS_FILE = "../backend/data/karnataka_crop_facts.json"
FACTS_TOP = 5   # crops listed per taluk or district in the app
SOWN_SHARE_FILE = "artifacts/season_sown_share.csv"   # read by the ML service
FIELD_CROPS_FILE = "artifacts/season_field_crops.csv"   # read by the ML service
# A field crop counts as sown in a district's season when it has at least this share of the season's field
# crops there (drops trace figures, such as a few hectares of rabi wheat on the coast)
MIN_FIELD_SHARE = 0.01
# Karnataka's own crop survey areas by district and season (training/read_des_estimates.py). For Karnataka
# they decide which field crops a district sows in each season (newer than ICRISAT's 2015-2019, and the
# figures people check the app against), and the app shows them as "sown in this district this season".
# They do not change the training labels: those are per taluk, which DES does not publish.
DES_FILE = "data/raw/karnataka_des_season_area.csv"


def yearly_shares(areas):
    """Each crop's share of its taluk's cropped area ("all crops"), per year."""
    total = areas[areas["Crop"] == "all crops"][["Place", "Year", "Area_ha"]].rename(columns={"Area_ha": "Total"})
    crops = areas[areas["Crop"] != "all crops"].merge(total[total["Total"] > 0], on=["Place", "Year"])
    crops["Share"] = crops["Area_ha"] / crops["Total"]
    return crops[["Place", "Year", "Crop", "Share"]]


def read_census():
    """The census file with each row's taluk shape ("Place"); the gross cropped area row is "all crops"."""
    census = pd.read_csv(TALUK_AREA_FILE)
    shape_of = {(t["district_code"], code): taluk_key(t) for t in TALUKS + list(MISSING.values())
                for code in t["taluk_codes"]}
    census["Place"] = [shape_of.get((d, t)) for d, t in zip(census["District_code"], census["Taluk_code"])]
    census["Crop"] = census["Crop"].fillna("all crops")
    return census


MIN_IRRIGATION_AREA_HA = 50   # a crop on less land than this in a census year is too small to judge


def irrigated_shares():
    """The irrigated share of each crop's land, per taluk shape and per district: the LOWEST share over the
    census years, so "at least this much, in every census". The app marks a crop "Needs irrigation" on
    rain-fed land when it is 50% or more. Taking the lowest year keeps noisy census years from raising false
    alarms: checked on all taluks, it flags 3% of dryland crops (horse gram, ragi, jowar...) against 4% for
    the plain average, while still flagging 77% of water-loving ones (sugarcane, irrigated paddy, tomato)."""
    census = read_census()
    census = census[(census["Crop"] != "all crops") & (census["Area_ha"] > 0)]
    district_of = {taluk_key(t): t["district"] for t in TALUKS + list(MISSING.values())}
    census["Stats_District"] = census["Place"].map(district_of)

    def shares(key):
        yearly = census.groupby([key, "Crop", "Year"])[["Irrigated_ha", "Area_ha"]].sum()
        yearly = yearly[yearly["Area_ha"] >= MIN_IRRIGATION_AREA_HA]
        lowest = (yearly["Irrigated_ha"] / yearly["Area_ha"]).groupby(level=[0, 1]).min().round(2)
        return {place: rows.droplevel(0).to_dict() for place, rows in lowest.groupby(level=0)}

    return shares("Place"), shares("Stats_District")


def taluk_areas():
    """Every crop's share per taluk shape, averaged over all the years that count that crop, and the
    census cropped area (average of the census years)."""
    census = read_census()
    # Sum census crops that are one crop for us (cardamom small + large, table + wine grapes) and
    # taluks that share a shape
    census = census.groupby(["Place", "Crop", "Year"], as_index=False)["Area_ha"].sum()
    cropped_area = census[census["Crop"] == "all crops"].groupby("Place")["Area_ha"].mean()

    kag = pd.read_csv(KAG_FILE)
    if not KAG_FOR_ALL_CROPS:
        kag = kag[kag["Crop"].isin(KAG_ONLY_CROPS + ["all crops"])]
    # A crop reported by one source only (coffee: census; cowpea: KAG) is averaged over that source's
    # years; a year that does not report a crop at all does not count as zero for it
    shares = pd.concat([yearly_shares(census), yearly_shares(kag)], ignore_index=True)
    share = shares.groupby(["Place", "Crop"], as_index=False)["Share"].mean()
    return share, cropped_area


def season_split(stats, icrisat):
    """How each crop's land divides between Kharif, Rabi and Summer in a place: split(state, district, crop)
    gives {"Kharif": .., "Rabi": .., "Summer": ..}. From the district's own figures (data.gov.in YEARS and
    ICRISAT_YEARS together), else its state's, else all of India's. A year-round crop gives 1 in every season."""
    seasonal = pd.concat([
        stats.assign(Season=stats["Season"].str.strip().map(DATA_GOV_SEASONS),
                     Area_ha=stats["Area_ha"] / (YEARS[1] - YEARS[0] + 1)),   # yearly average, like ICRISAT's
        icrisat,
    ])
    seasonal = seasonal[seasonal["Season"].isin(SEASONS)]
    tidy = seasonal["Crop"].str.replace(r"\s+", " ", regex=True).str.strip().str.lower()
    for crop, like in SEASON_LIKE.items():
        seasonal.loc[tidy.isin(like), "Crop"] = crop
    tables = []
    for keys in (["State", "District", "Crop"], ["State", "Crop"], ["Crop"]):
        table = seasonal.groupby(keys + ["Season"])["Area_ha"].sum().unstack("Season")
        table = table.reindex(columns=list(SEASONS)).fillna(0)
        table = table[table.sum(axis=1) > 0]
        tables.append(table.div(table.sum(axis=1), axis=0).to_dict("index"))
    every_season = {season: 1.0 for season in SEASONS}

    def split(state, district, crop):
        if crop in YEAR_ROUND:
            return every_season
        if (state, crop) in KNOWN_SEASONS:
            return KNOWN_SEASONS[(state, crop)]
        for table, key in zip(tables, [(state, district, crop), (state, crop), crop]):
            if key in table:
                return table[key]
        return every_season   # no season figures anywhere: counted in every season

    return split


def in_seasons(table, split, district_column):
    """Every row of table once per season, with its "Season" code and the crop's "Season_Share" there."""
    shares = [split(s, d, c) for s, d, c in zip(table["State"], table[district_column], table["Crop"])]
    parts = []
    for season, code in SEASONS.items():
        part = table.copy()
        part["Season"] = code
        part["Season_Share"] = [share[season] for share in shares]
        parts.append(part[part["Season_Share"] > 0])
    return pd.concat(parts, ignore_index=True)


def is_a_crop(names):
    tidy = names.str.replace(r"\s+", " ", regex=True).str.strip().str.lower()
    return ~tidy.isin({" ".join(name.split()).lower() for name in NOT_A_CROP})


def read_icrisat(area):
    """ICRISAT's yearly average area per district, crop and season (Kharif, Rabi, Summer and Total) over
    ICRISAT_YEARS, with the district names of the data.gov.in statistics."""
    newer = pd.read_csv("data/raw/icrisat_season_area.csv")
    newer = newer[newer["Year"].between(*ICRISAT_YEARS)]
    newer["State"] = newer["State"].replace(ICRISAT_STATE_NAMES)
    newer["Crop"] = newer["Crop"].str.strip().map(
        lambda c: ICRISAT_CROP_NAMES.get(c, CROP_NAMES.get(c, c.lower().strip()))
    )
    years = ICRISAT_YEARS[1] - ICRISAT_YEARS[0] + 1
    newer = newer.groupby(["State", "District", "Crop", "Season"], as_index=False)["Area_ha"].sum()
    newer["Area_ha"] = newer["Area_ha"] / years

    # ICRISAT district names -> the names used in the statistics (and so in our labels)
    districts_by_state = area.groupby("State")["District"].unique().apply(list).to_dict()
    matched_name = {}
    for state, district in newer[["State", "District"]].drop_duplicates().itertuples(index=False):
        match = stats_district_for(state, district, districts_by_state)
        if match:
            matched_name[(state, district)] = match
    newer["District"] = [matched_name.get((s, d)) for s, d in zip(newer["State"], newer["District"])]
    return newer.dropna(subset=["District"])


def use_newer_areas(area, icrisat):
    """Replaces a district's crop areas with the newer ICRISAT average where we have it."""
    newer = icrisat[(icrisat["Season"] == "Total") & is_a_crop(icrisat["Crop"])].drop(columns="Season")
    refreshed = set(zip(newer["State"], newer["District"]))
    # ICRISAT does not report every crop in every state for these years (it has no Karnataka sugarcane
    # or tobacco after 2014), so a crop it does not report at all in a state keeps its older area there
    reported = set(zip(newer.loc[newer["Area_ha"] > 0, "State"], newer.loc[newer["Area_ha"] > 0, "Crop"]))
    not_refreshed = pd.Series([(s, d) not in refreshed for s, d in zip(area["State"], area["District"])], index=area.index)
    not_reported = pd.Series([(s, c) not in reported for s, c in zip(area["State"], area["Crop"])], index=area.index)
    kept = area[not_refreshed | not_reported]
    print(f"Newer ICRISAT areas ({ICRISAT_YEARS[0]}-{ICRISAT_YEARS[1]}) for {len(refreshed)} districts; "
          f"{len(area[not_refreshed][['State', 'District']].drop_duplicates())} districts keep {YEARS[0]}-{YEARS[1]}; "
          f"{(~not_refreshed & not_reported).sum()} crop areas ICRISAT does not report are kept from {YEARS[0]}-{YEARS[1]}")
    return pd.concat([kept, newer], ignore_index=True)


# --- Labels: crop share per statistics district ------------------------------

stats = pd.read_csv("data/raw/india_crop_stats.csv")
stats = stats[stats["Year"].between(*YEARS)]   # totals and groups stay for season_split; the labels drop them
stats["Crop"] = stats["Crop"].map(lambda c: CROP_NAMES.get(c, c.lower().strip()))
stats["District"] = stats["District"].str.strip()

yearly = stats[is_a_crop(stats["Crop"])].groupby(["State", "District", "Crop", "Year"], as_index=False)["Area_ha"].sum()
area = yearly.groupby(["State", "District", "Crop"], as_index=False)["Area_ha"].sum()
area["Area_ha"] = area["Area_ha"] / (YEARS[1] - YEARS[0] + 1)

# Coffee is counted by the Coffee Board, not by the agriculture statistics above, so Chikmagalur,
# Kodagu and Wayanad look as if they grow no coffee at all. data/raw/plantation_area.csv holds the
# Coffee Board's planted area for every coffee district, which is added to the labels here.
# Newer crop areas, where we have them: ICRISAT covers 20 states up to 2019, while the data.gov.in
# series above stops at 2014 (see training/read_icrisat.py). For a district ICRISAT also reports,
# its 2015-2019 average replaces the crop list of that district, except crops ICRISAT does not report in
# that state at all (Karnataka sugarcane), which keep their 2010-2014 area.
# Districts outside those states keep the 2010-2014 figures.
icrisat = read_icrisat(area)
area = use_newer_areas(area, icrisat)

# Coffee and the fruit and vegetable crops are added last, because neither series above counts them:
# the agriculture statistics cover field crops, while fruit and vegetables are counted separately by
# the horticulture departments. Without these the model could never name mango in Kolar or grapes in
# Vijayapura, however much land there grows them.
not_in_the_agriculture_series = [
    pd.read_csv("data/raw/plantation_area.csv"),      # Coffee Board of India
    pd.read_csv("data/raw/horticulture_area.csv"),    # Horticultural Statistics at a Glance 2018
]
for extra in not_in_the_agriculture_series:
    # Where the statistics above also have the crop for that district, the official figure replaces it
    replaced = set(zip(extra["State"], extra["District"], extra["Crop"]))
    area = area[[key not in replaced for key in zip(area["State"], area["District"], area["Crop"])]]
    area = pd.concat([area, extra[["State", "District", "Crop", "Area_ha"]]], ignore_index=True)

stats_districts = area.groupby("State")["District"].unique().apply(list).to_dict()
split = season_split(stats, icrisat)

# --- Features: match every sample point's district to the statistics --------

points = pd.read_csv("data/raw/india_location_features.csv")
points["State"] = points["State"].replace(STATE_NAMES)
boundary_districts = points[["State", "District"]].drop_duplicates()
boundary_districts["Stats_District"] = [
    stats_district_for(s, d, stats_districts) for s, d in zip(boundary_districts["State"], boundary_districts["District"])
]
unmatched = boundary_districts[boundary_districts["Stats_District"].isna()]
points = points.merge(boundary_districts, on=["State", "District"])
points = points[points["Stats_District"].notna()]

# Karnataka statistics districts must all be matched - it is the app's main region
karnataka_matched = set(boundary_districts.loc[boundary_districts["State"] == "Karnataka", "Stats_District"].dropna())
karnataka_missing = set(stats_districts["Karnataka"]) - karnataka_matched

# --- Crop share per matched district and season ---------------------------------
# A season's crop mix: each crop's land times its season share (season_split), as a share of all the
# land farmed in that season. Year-round crops count in every season, so where little is sown in rabi,
# the rabi mix is mostly the plantation crops that stand there all year.

area = area.rename(columns={"District": "Stats_District"})
area["Share"] = area["Area_ha"] / area.groupby(["State", "Stats_District"])["Area_ha"].transform("sum")
district_all_crops = area.copy()   # every crop's share of all the district's cropped land, for the app
area = in_seasons(area, split, "Stats_District")
area["Area_ha"] = area["Area_ha"] * area.pop("Season_Share")
# How the district's field crops (not the year-round ones) divide between the seasons. The model always
# names crops for a season, even where almost nothing is sown then (the Thar desert in summer), so the
# app says so when a season's share is small.
field_crops = area[~area["Crop"].isin(YEAR_ROUND)]
sown_share = field_crops.groupby(["State", "Stats_District", "Season"])["Area_ha"].sum().unstack("Season", fill_value=0)
sown_share = sown_share.div(sown_share.sum(axis=1), axis=0).round(3)
sown_share = sown_share.rename(columns={code: name for name, code in SEASONS.items()}).reset_index()
# The field crops each district really sows in each season, for the app's "to sow this season" list: the
# model's crops are kept only where the district's own statistics sow them then (Chikkamagaluru sows
# no rabi rice, so rice is never on its rabi list, however much the model likes the land for rice)
season_field = field_crops.groupby(["State", "Stats_District", "Season", "Crop"], as_index=False)["Area_ha"].sum()
season_field["Share"] = season_field["Area_ha"] / season_field.groupby(["State", "Stats_District", "Season"])["Area_ha"].transform("sum")
season_field = season_field[season_field["Share"] >= MIN_FIELD_SHARE]
season_field["Season"] = season_field["Season"].map({code: name for name, code in SEASONS.items()})
# Karnataka: from the crop survey (DES) instead
des = pd.read_csv(DES_FILE)
des_field = des[~des["Crop"].isin(YEAR_ROUND)].rename(columns={"District": "Stats_District"}).assign(State="Karnataka")
des_field["Share"] = des_field["Area_ha"] / des_field.groupby(["Stats_District", "Season"])["Area_ha"].transform("sum")
season_field = pd.concat([season_field[season_field["State"] != "Karnataka"],
                          des_field[des_field["Share"] >= MIN_FIELD_SHARE]], ignore_index=True)
season_field[["State", "Stats_District", "Season", "Crop", "Share"]].round(3).to_csv(FIELD_CROPS_FILE, index=False)
area["Share"] = area["Area_ha"] / area.groupby(["State", "Stats_District", "Season"])["Area_ha"].transform("sum")
area = area[area["Share"] >= MIN_SHARE]
districts_per_crop = area.groupby("Crop")["Stats_District"].nunique()
area = area[area["Crop"].isin(districts_per_crop[districts_per_crop >= MIN_DISTRICTS].index)]
area["Share"] = area["Share"] / area.groupby(["State", "Stats_District", "Season"])["Share"].transform("sum")
area.to_csv("data/processed/district_crop_share.csv", index=False)

# --- Crop share per Karnataka taluk (Agriculture Census) and season ---------------
# Same rules as the districts: a crop counts if it covers 2.5% of the taluk's land in that season, and
# only crops the district labels already know are used. The census and DES count whole years only, so a
# taluk's crops are split into seasons the way its district's are (the district's season_split).

taluk_area, cropped_area = taluk_areas()
taluk_area = taluk_area[taluk_area["Place"].isin(cropped_area.index)]
taluk_area["Area_ha"] = taluk_area["Share"] * taluk_area["Place"].map(cropped_area)   # for the app's facts
known_crops = set(area["Crop"]) | set(KAG_ONLY_CROPS)   # avare is counted only in Karnataka, by KAG
district_of_taluk = {taluk_key(t): t["district"] for t in TALUKS + list(MISSING.values())}
taluk_share = in_seasons(taluk_area.assign(State="Karnataka", District=taluk_area["Place"].map(district_of_taluk)),
                         split, "District")
taluk_share["Share"] = taluk_share["Share"] * taluk_share.pop("Season_Share")
taluk_share["Share"] = taluk_share["Share"] / taluk_share.groupby(["Place", "Season"])["Share"].transform("sum")
taluk_share = taluk_share[(taluk_share["Share"] >= MIN_SHARE) & taluk_share["Crop"].isin(known_crops)].copy()
taluk_share["Share"] = taluk_share["Share"] / taluk_share.groupby(["Place", "Season"])["Share"].transform("sum")
taluk_share[["Place", "Season", "Crop", "Share"]].to_csv("data/processed/taluk_crop_share.csv", index=False)

# Which taluk is every Karnataka point in? Points the taluk map cannot place keep district labels.
in_karnataka = points["State"] == "Karnataka"
found = [taluk_at(lat, lng) if kar else None
         for lat, lng, kar in zip(points["Latitude"], points["Longitude"], in_karnataka)]
points["Taluk"] = [t["taluk"] if t else "" for t in found]
points["Place"] = [taluk_key(t) if t else None for t in found]
by_taluk = points["Place"].isin(set(taluk_share["Place"]))

# Telangana's statistics are matched to Andhra Pradesh polygons, so join on district name only there
points["Join_State"] = points["State"]
telangana = set(stats_districts.get("Telangana", []))
points.loc[points["Stats_District"].isin(telangana) & (points["State"] == "Andhra Pradesh"), "Join_State"] = "Telangana"

# Every point with its district's sown share per season, for the ML service (nearest point to a farm)
sown_points = points.merge(sown_share.rename(columns={"State": "Join_State"}), on=["Join_State", "Stats_District"])
sown_points = sown_points.rename(columns={"Join_State": "Stats_State"})   # the district's key in FIELD_CROPS_FILE
sown_points[["Latitude", "Longitude", "Stats_State", "Stats_District"] + list(SEASONS)].to_csv(SOWN_SHARE_FILE, index=False)
by_district = points[~by_taluk].drop(columns="Place").merge(
    area[["State", "Stats_District", "Season", "Crop", "Share"]].rename(columns={"State": "Join_State"}),
    on=["Join_State", "Stats_District"])
by_district["Place"] = by_district["State"] + " | " + by_district["Stats_District"]
# One row per point, season and crop: the same land (features) with the crop mix of each season
data = pd.concat([points[by_taluk].merge(taluk_share[["Place", "Season", "Crop", "Share"]], on="Place"), by_district],
                 ignore_index=True)
data["Copies"] = (data["Share"] * COPIES_PER_SHARE).round().astype(int)
data = data[data["Copies"] > 0]
data = data.loc[data.index.repeat(data["Copies"])].drop(columns=["Copies", "Join_State"]).reset_index(drop=True)
# The taluk's name is only used here; "Place" already carries the taluk key into the saved dataset
data.drop(columns="Taluk").to_csv("data/processed/india_dataset.csv", index=False)

# --- Facts for the app: what is really grown most in each taluk and district ---------
# Shares are of ALL the place's cropped land (not only the crops the model knows), before any filtering.

model_crops = set(data["Crop"])


def top_crops(rows, total):
    rows = rows[rows["Crop"].isin(model_crops) & (rows["Area_ha"] > 0)].nlargest(FACTS_TOP, "Area_ha")
    return [{"crop": c, "area_ha": round(a), "share": round(a / total, 3)} for c, a in zip(rows["Crop"], rows["Area_ha"])]


facts = {
    "sources": {
        "taluks": "Average of Agriculture Census 2010-11 and 2015-16 (Government of India) and Karnataka "
                  "Directorate of Economics and Statistics 2019-22 (Karnataka At A Glance)",
        "districts": "District crop statistics: ICRISAT district database 2015-2019 (data.gov.in 2010-2014 "
                     "where missing), Coffee Board, Horticultural Statistics at a Glance 2018",
        "seasons": f"Karnataka Directorate of Economics and Statistics, Fully Revised Estimates {des['Year'].iloc[0]} "
                   "(crop survey areas)",
    },
    "taluks": {},
    "districts": {},
}
# "irrigated": each crop's irrigated share of its land (Agriculture Census), for the "Needs irrigation" mark
taluk_irrigated, district_irrigated = irrigated_shares()
for taluk in TALUKS + list(MISSING.values()):
    place = taluk_key(taluk)
    if place in cropped_area.index and cropped_area[place] > 0:
        facts["taluks"][place] = {
            "district": taluk["district"], "taluk": taluk["taluk"], "cropped_area_ha": round(cropped_area[place]),
            "crops": top_crops(taluk_area[taluk_area["Place"] == place], cropped_area[place]),
            "irrigated": taluk_irrigated.get(place, {}),
        }
karnataka_all = district_all_crops[district_all_crops["State"] == "Karnataka"]
for district, rows in karnataka_all.groupby("Stats_District"):
    facts["districts"][district] = {"cropped_area_ha": round(rows["Area_ha"].sum()),
                                    "crops": top_crops(rows, rows["Area_ha"].sum()),
                                    "irrigated": district_irrigated.get(district, {}),
                                    # the field crops sown most in each season (DES crop survey), largest first
                                    "seasons": {season: [{"crop": c, "area_ha": round(a), "share": round(sh, 3)} for c, a, sh in
                                                         rows_s.nlargest(FACTS_TOP, "Area_ha")[["Crop", "Area_ha", "Share"]].values]
                                                for season, rows_s in des_field[des_field["Stats_District"] == district].groupby("Season")}}
with open(FACTS_FILE, "w", encoding="utf-8") as f:
    json.dump(facts, f, indent=1)

# --- Report -------------------------------------------------------------------

karnataka_rows = data[data["State"] == "Karnataka"]
print(f"Boundary districts with points: {len(boundary_districts)} | matched to statistics: "
      f"{len(boundary_districts) - len(unmatched)} | unmatched: {len(unmatched)}")
print("Karnataka statistics districts without points:", sorted(karnataka_missing) or "none")
print(f"Training rows: {len(data)} | points: {data[['Latitude', 'Longitude']].drop_duplicates().shape[0]} "
      f"| crops: {data['Crop'].nunique()}")
print("Rows per season:", {name: int((data["Season"] == code).sum()) for name, code in SEASONS.items()})
print(f"Saved {SOWN_SHARE_FILE}: {len(sown_points)} points | districts sowing under 5% of their field crops in "
      + ", ".join(f"{name}: {(sown_share[name] < 0.05).sum()}" for name in SEASONS))
print(f"Karnataka: {karnataka_rows[['Latitude', 'Longitude']].drop_duplicates().shape[0]} points, "
      f"{karnataka_rows['Crop'].nunique()} crops")
print(f"Karnataka points labelled by taluk: {points[by_taluk].shape[0]} in {points.loc[by_taluk, 'Place'].nunique()} "
      f"taluks | by district (taluk unknown or without census data): {(in_karnataka & ~by_taluk).sum()}")
print(f"Saved {FACTS_FILE}: {len(facts['taluks'])} taluks, {len(facts['districts'])} districts")
if len(unmatched):
    print("\nUnmatched boundary districts (no statistics found):")
    print(unmatched[["State", "District"]].to_string(index=False))
