# Normal yearly rainfall of every district, from the India Meteorological Department (IMD): "District wise
# rainfall normal" (1951-2000 average, published on data.gov.in; data/raw/imd_district_rainfall_normal.csv
# is that file). Used by the ML service to check crops against their FAO EcoCrop rainfall needs
# (app/suitability.py).
#
# Why not the NASA POWER rainfall the model uses: NASA's grid cells are about 50 km wide, and along the
# Western Ghats they mix in the hills' rain - Mysuru district reads 1,604 mm against IMD's 759 mm, Davanagere
# 1,365 against 677. The model was trained on NASA's figures, so it keeps them; but the crop requirements are
# in real millimetres, so they are checked against IMD's.
#
# District names are matched to our statistics districts (the keys of artifacts/season_sown_share.csv) the
# way build_dataset.py matches them: Karnataka by its name list, elsewhere by the same cleaned name or a close spelling.
#
# Besides the year, the normal rain of each sowing season (the app's seasons, from IMD's monthly normals):
# a seasonal crop's rainfall need (FAO EcoCrop) is for its own growing months, so a rabi vegetable is checked
# against rabi's rain, not the monsoon's.
#
# Output: artifacts/district_rainfall.csv - Stats_State, Stats_District, Rain_mm, Kharif_mm, Rabi_mm, Summer_mm
# Run from the ml-service folder:  python training/read_imd_rainfall.py

import difflib
import json
import re

import pandas as pd

RAW_FILE = "data/raw/imd_district_rainfall_normal.csv"
SEASON_MONTHS = {"Kharif": ["JUN", "JUL", "AUG", "SEP"], "Rabi": ["OCT", "NOV", "DEC", "JAN"],
                 "Summer": ["FEB", "MAR", "APR", "MAY"]}
OUT_FILE = "artifacts/district_rainfall.csv"
# IMD spellings -> our statistics names, where neither the name list nor a close spelling finds them
KARNATAKA_IMD = {"uttar kannada": "UTTAR KANNAD", "dakshin kanda": "DAKSHIN KANNAD", "belgam": "BELGAUM",
                 "bangalore rur": "BANGALORE RURAL", "bangalore urb": "BENGALURU URBAN",
                 "chamarajanaga": "CHAMARAJANAGAR", "ramnagar(bngr)": "RAMANAGARA", "chickballapur": "CHIKBALLAPUR"}


def clean(name):
    return re.sub(r"[^a-z]", "", str(name).lower().replace("&", "and").replace("district", ""))


imd = pd.read_csv(RAW_FILE)
ours = pd.read_csv("artifacts/season_sown_share.csv")[["Stats_State", "Stats_District"]].drop_duplicates()
karnataka_names = json.load(open("../backend/data/karnataka_district_names.json"))
karnataka_alias = {alias: district for district, aliases in karnataka_names.items() for alias in aliases}
districts_of = ours.groupby("Stats_State")["Stats_District"].apply(list).to_dict()
state_of = {clean(state): state for state in districts_of}

rows, unmatched = [], []
for _, row in imd.iterrows():
    state = state_of.get(clean(row["STATE_UT_NAME"]))
    name = str(row["DISTRICT"]).strip().lower()
    if state == "Karnataka":
        match = karnataka_alias.get(name) or KARNATAKA_IMD.get(name)
    elif state:
        by_clean = {clean(d): d for d in districts_of[state]}
        close = difflib.get_close_matches(clean(name), list(by_clean), n=1, cutoff=0.85)
        match = by_clean.get(clean(name)) or (by_clean[close[0]] if close else None)
    else:
        match = None
    if match:
        rows.append({"Stats_State": state, "Stats_District": match, "Rain_mm": row["ANNUAL"],
                     **{f"{season}_mm": sum(row[m] for m in months) for season, months in SEASON_MONTHS.items()}})
    else:
        unmatched.append(f"{row['STATE_UT_NAME']} / {row['DISTRICT']}")

table = pd.DataFrame(rows).groupby(["Stats_State", "Stats_District"], as_index=False)[
    ["Rain_mm"] + [f"{season}_mm" for season in SEASON_MONTHS]].mean().round(1)
table.to_csv(OUT_FILE, index=False)
covered = len(table) / len(ours)
print(f"Saved {OUT_FILE}: {len(table)} of our {len(ours)} districts ({covered:.0%}); "
      f"Karnataka {(table['Stats_State'] == 'Karnataka').sum()} of 30 | IMD districts not matched: {len(unmatched)}")
