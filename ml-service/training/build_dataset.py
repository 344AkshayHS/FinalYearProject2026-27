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
# District names differ between the statistics and the boundary files, so they are matched:
#   - Karnataka: exact, through backend/data/karnataka_district_names.json
#   - other states: same cleaned name, or a very close spelling in the same state
#
# Run from the ml-service folder:  python training/build_dataset.py

import difflib
import json
import re
import pandas as pd

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


def is_a_crop(names):
    tidy = names.str.replace(r"\s+", " ", regex=True).str.strip().str.lower()
    return ~tidy.isin({" ".join(name.split()).lower() for name in NOT_A_CROP})


def use_newer_areas(area):
    """Replaces a district's crop areas with the newer ICRISAT average where we have it."""
    newer = pd.read_csv("data/raw/icrisat_season_area.csv")
    newer = newer[(newer["Season"] == "Total") & newer["Year"].between(*ICRISAT_YEARS)]
    newer["State"] = newer["State"].replace(ICRISAT_STATE_NAMES)
    newer["Crop"] = newer["Crop"].str.strip().map(
        lambda c: ICRISAT_CROP_NAMES.get(c, CROP_NAMES.get(c, c.lower().strip()))
    )
    newer = newer[is_a_crop(newer["Crop"])]
    years = ICRISAT_YEARS[1] - ICRISAT_YEARS[0] + 1
    newer = newer.groupby(["State", "District", "Crop"], as_index=False)["Area_ha"].sum()
    newer["Area_ha"] = newer["Area_ha"] / years

    # ICRISAT district names -> the names used in the statistics (and so in our labels)
    districts_by_state = area.groupby("State")["District"].unique().apply(list).to_dict()
    matched_name = {}
    for state, district in newer[["State", "District"]].drop_duplicates().itertuples(index=False):
        match = stats_district_for(state, district, districts_by_state)
        if match:
            matched_name[(state, district)] = match
    newer["District"] = [matched_name.get((s, d)) for s, d in zip(newer["State"], newer["District"])]
    newer = newer.dropna(subset=["District"])

    refreshed = set(zip(newer["State"], newer["District"]))
    kept = area[~area.apply(lambda row: (row["State"], row["District"]) in refreshed, axis=1)]
    print(f"Newer ICRISAT areas ({ICRISAT_YEARS[0]}-{ICRISAT_YEARS[1]}) for {len(refreshed)} districts; "
          f"{len(kept[['State', 'District']].drop_duplicates())} districts keep {YEARS[0]}-{YEARS[1]}")
    return pd.concat([kept, newer], ignore_index=True)


# --- Labels: crop share per statistics district ------------------------------

stats = pd.read_csv("data/raw/india_crop_stats.csv")
stats = stats[stats["Year"].between(*YEARS) & is_a_crop(stats["Crop"])]
stats["Crop"] = stats["Crop"].map(lambda c: CROP_NAMES.get(c, c.lower().strip()))
stats["District"] = stats["District"].str.strip()

yearly = stats.groupby(["State", "District", "Crop", "Year"], as_index=False)["Area_ha"].sum()
area = yearly.groupby(["State", "District", "Crop"], as_index=False)["Area_ha"].sum()
area["Area_ha"] = area["Area_ha"] / (YEARS[1] - YEARS[0] + 1)

# Coffee is counted by the Coffee Board, not by the agriculture statistics above, so Chikmagalur,
# Kodagu and Wayanad look as if they grow no coffee at all. data/raw/plantation_area.csv holds the
# Coffee Board's planted area for every coffee district, which is added to the labels here.
# Newer crop areas, where we have them: ICRISAT covers 20 states up to 2019, while the data.gov.in
# series above stops at 2014 (see training/read_icrisat.py). For a district ICRISAT also reports,
# its 2015-2019 average replaces the whole crop list of that district, so the shares stay consistent.
# Districts outside those states keep the 2010-2014 figures.
area = use_newer_areas(area)

# Coffee and the fruit and vegetable crops are added last, because neither series above counts them:
# the agriculture statistics cover field crops, while fruit and vegetables are counted separately by
# the horticulture departments. Without these the model could never name mango in Kolar or grapes in
# Vijayapura, however much land there grows them.
not_in_the_agriculture_series = [
    pd.read_csv("data/raw/plantation_area.csv"),      # Coffee Board of India
    pd.read_csv("data/raw/horticulture_area.csv"),    # Horticultural Statistics at a Glance 2018
]
for extra in not_in_the_agriculture_series:
    area = pd.concat([area, extra[["State", "District", "Crop", "Area_ha"]]], ignore_index=True)

stats_districts = area.groupby("State")["District"].unique().apply(list).to_dict()

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

# --- Crop share per matched district ------------------------------------------

area = area.rename(columns={"District": "Stats_District"})
area["Share"] = area["Area_ha"] / area.groupby(["State", "Stats_District"])["Area_ha"].transform("sum")
area = area[area["Share"] >= MIN_SHARE]
districts_per_crop = area.groupby("Crop")["Stats_District"].nunique()
area = area[area["Crop"].isin(districts_per_crop[districts_per_crop >= MIN_DISTRICTS].index)]
area["Share"] = area["Share"] / area.groupby(["State", "Stats_District"])["Share"].transform("sum")
area.to_csv("data/processed/district_crop_share.csv", index=False)

# Telangana's statistics are matched to Andhra Pradesh polygons, so join on district name only there
points["Join_State"] = points["State"]
telangana = set(stats_districts.get("Telangana", []))
points.loc[points["Stats_District"].isin(telangana) & (points["State"] == "Andhra Pradesh"), "Join_State"] = "Telangana"
data = points.merge(area[["State", "Stats_District", "Crop", "Share"]].rename(columns={"State": "Join_State"}),
                    on=["Join_State", "Stats_District"])
data["Copies"] = (data["Share"] * COPIES_PER_SHARE).round().astype(int)
data = data[data["Copies"] > 0]
data = data.loc[data.index.repeat(data["Copies"])].drop(columns=["Copies", "Join_State"]).reset_index(drop=True)
data.to_csv("data/processed/india_dataset.csv", index=False)

# --- Report -------------------------------------------------------------------

karnataka_rows = data[data["State"] == "Karnataka"]
print(f"Boundary districts with points: {len(boundary_districts)} | matched to statistics: "
      f"{len(boundary_districts) - len(unmatched)} | unmatched: {len(unmatched)}")
print("Karnataka statistics districts without points:", sorted(karnataka_missing) or "none")
print(f"Training rows: {len(data)} | points: {data[['Latitude', 'Longitude']].drop_duplicates().shape[0]} "
      f"| crops: {data['Crop'].nunique()}")
print(f"Karnataka: {karnataka_rows[['Latitude', 'Longitude']].drop_duplicates().shape[0]} points, "
      f"{karnataka_rows['Crop'].nunique()} crops")
if len(unmatched):
    print("\nUnmatched boundary districts (no statistics found):")
    print(unmatched[["State", "District"]].to_string(index=False))
