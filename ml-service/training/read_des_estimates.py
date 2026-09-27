# Reads Karnataka's official crop areas by district and season from the Directorate of Economics and
# Statistics (DES), "Fully Revised Estimates of Area, Production and Yield of Principal Crops in Karnataka".
# The areas come from the GIS-enabled crop survey of every plot, so they are the state's own reference for
# what is sown where in each season - the figures a farmer or an examiner will check the app against.
#
# Source: https://des.karnataka.gov.in/storage/pdf-files/AGS/FRE2022-23Final.pdf (downloaded if missing;
# the PDF is not on GitHub, the CSV below is). Reading it needs `pdftotext`, which comes with Git for Windows.
#
# The report has one table per page, in several layouts; every table read here is checked:
#   - one season per table (rice, maize, jowar, ...): irrigated, unirrigated and total, per variety - only
#     the POOLED variety (all varieties together) is kept; all 31 districts must be there, and they must add
#     up to the State Total row where the report prints it on one line;
#   - seasons side by side (pulses, vegetables): kharif, rabi (or "rabi/summer") and summer columns, which
#     must add up to the table's own total column for every district.
# "Rabi/summer" (some pulses, cotton) counts as rabi, where most of it is sown. Vijayanagara, made in 2021, is
# added to Ballari, as in the rest of our data (Census 2011 boundaries).
#
# Output: data/raw/karnataka_des_season_area.csv - Year, District (our statistics names), Crop, Season, Area_ha
# Run from the ml-service folder:  python training/read_des_estimates.py

import json
import os
import re
import shutil
import subprocess
import urllib.request

import pandas as pd

YEAR = "2022-23"
URL = f"https://des.karnataka.gov.in/storage/pdf-files/AGS/FRE{YEAR}Final.pdf"
PDF = f"data/raw/des/FRE{YEAR}Final.pdf"
OUT_FILE = "data/raw/karnataka_des_season_area.csv"

# DES crop names -> ours (crops the model does not know are left out)
CROPS = {
    "RICE": "rice", "JOWAR": "jowar", "BAJRA": "bajra", "MAIZE": "maize", "RAGI": "ragi", "WHEAT": "wheat",
    "TUR (REDGRAM)": "pigeonpea (tur)", "GRAM (BENGALGRAM)": "chickpea", "HORSEGRAM": "horse gram",
    "BLACKGRAM": "black gram", "GREENGRAM": "green gram", "COWPEA": "cowpea", "AVARE": "field bean (avare)",
    "GROUNDNUT": "groundnut", "SUNFLOWER": "sunflower", "COTTON": "cotton", "TOBACCO": "tobacco",
    "SOYABEAN": "soybean", "SESAMUM": "sesame", "CASTOR": "castor", "LINSEED": "linseed", "NIGERSEED": "niger seed",
    "RAPESEED & MUSTARD": "mustard", "SAFFLOWER": "safflower", "ONION": "onion", "POTATO": "potato",
    "TOMATO": "tomato", "DRY CHILLIES": "chilli",
}
SEASONS = {"KHARIF": "Kharif", "RABI": "Rabi", "RABI/SUMMER": "Rabi", "SUMMER": "Summer",
           "ANNUAL": "Kharif"}   # the only annual field crop kept is tobacco, a kharif crop in Karnataka
# Pages that put several oilseeds side by side, each with one season
SIDE_BY_SIDE = {
    "CASTOR SESAMUM LINSEED": [("CASTOR", "KHARIF"), ("SESAMUM", "KHARIF"), ("LINSEED", "RABI")],
    "SOYABEAN NIGERSEED RAPESEED & MUSTARD": [("SOYABEAN", "KHARIF"), ("NIGERSEED", "KHARIF"),
                                              ("RAPESEED & MUSTARD", "RABI"), ("SAFFLOWER", "RABI")],
}

names = json.load(open("../backend/data/karnataka_district_names.json"))
ALIAS = {alias: district for district, aliases in names.items() for alias in aliases}
ALIAS.update({"vijaypura": "BIJAPUR", "kalaburgi": "GULBARGA", "chickballapur": "CHIKBALLAPUR",
              "ramanagaram": "RAMANAGARA", "dakshina kannada": "DAKSHIN KANNAD", "uttara kannada": "UTTAR KANNAD",
              "vijayanagara": "BELLARY", "vijayangara": "BELLARY", "viajayanagara": "BELLARY"})   # DES spellings
# A district row, on one line (a serial number alone on the line above is fine): name, then numbers
ROW = re.compile(r"^[ \t]*(?:\d{1,2}[ \t]+)?([A-Za-z][A-Za-z .-]+?)[ \t]+((?:[\d.]+[ \t]+)*[\d.]+)[ \t\r]*$", re.M)


def district(name):
    key = re.sub(r"\s+", " ", name.replace("-", " ")).strip().lower()
    return ALIAS.get(key) or ALIAS.get(key.replace(" ", ""))


def district_rows(page):
    """[(DES name, our district, numbers)] for the page's district rows, and the State Total numbers if printed."""
    rows, total = [], None
    for m in ROW.finditer(page):
        numbers = [float(x) for x in m.group(2).split()]
        if m.group(1).strip().lower() == "state total":
            total = numbers
        elif district(m.group(1)):
            rows.append((m.group(1).strip(), district(m.group(1)), numbers))
    return rows, total


def pages_of_report():
    if not os.path.exists(PDF):
        os.makedirs(os.path.dirname(PDF), exist_ok=True)
        request = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with open(PDF, "wb") as f:
            f.write(urllib.request.urlopen(request, timeout=300).read())
    pdftotext = shutil.which("pdftotext") or r"C:\Program Files\Git\mingw64\bin\pdftotext.exe"
    text = subprocess.run([pdftotext, "-raw", PDF, "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    return text.split("\f")


one_season, side, problems = [], [], []
for number, page in enumerate(pages_of_report(), start=1):
    title = re.search(r"^CROP\s+(.+)$", page, re.M)
    multi = next((k for k in SIDE_BY_SIDE if k in page), None)
    if not title and not multi:
        continue
    rows, total = district_rows(page)
    if multi and not title:
        groups = SIDE_BY_SIDE[multi]
        for _, name, numbers in rows:
            if len(numbers) == 3 * len(groups):
                for i, (crop, season) in enumerate(groups):
                    one_season.append((crop, season, "POOLED", name, numbers[3 * i], number))
        continue
    crop = re.split(r"\s+(?:SEASON|VARIETY)\b", title.group(1))[0].strip()
    if crop not in CROPS:
        continue
    season = re.search(r"SEASON\s+([A-Z/]+(?: SEASONS?)?)", page)
    variety = re.search(r"VARIETY\s+([A-Z]+)", page)
    counts = {len(n) for _, _, n in rows}
    if season and season.group(1) in SEASONS and counts <= {3, 9}:
        # one season: [irrigated, unirrigated, total] x [area, production, yield], or just area, production, yield
        if len(rows) < 31:
            problems.append(f"page {number} {crop}: only {len(rows)} district rows")
            continue
        area = [n[6] if len(n) == 9 else n[0] for _, _, n in rows]
        if total and len(total) == len(rows[0][2]) and abs(sum(area) - total[6 if len(total) == 9 else 0]) > 2 + 0.001 * sum(area):
            problems.append(f"page {number} {crop} {season.group(1)}: districts add up to {sum(area):.0f}, State Total says {total}")
            continue
        for (_, name, _), value in zip(rows, area):
            one_season.append((crop, season.group(1), variety.group(1) if variety else "POOLED", name, value, number))
    elif not season:
        # seasons side by side; which ones, from the column heading lines
        heads = " ".join(re.findall(r"^((?:KHARIF|RABI/SUMMER|RABI|SUMMER|TOTAL)(?:\s+(?:KHARIF|RABI/SUMMER|RABI|SUMMER|TOTAL))*)\s*$",
                                    page, re.M))
        columns = {12: ["KHARIF", "RABI", "SUMMER", "TOTAL"],
                   9: ["KHARIF", "RABI/SUMMER", "TOTAL"] if "RABI/SUMMER" in heads else None,
                   6: ["KHARIF", "RABI"] if heads == "KHARIF RABI" else ["SUMMER", "TOTAL"] if heads == "SUMMER TOTAL" else None,
                   3: ["KHARIF"] if heads == "KHARIF" else None}
        for _, name, numbers in rows:
            labels = columns.get(len(numbers))
            if labels:
                for i, label in enumerate(labels):
                    side.append((crop, label, name, numbers[3 * i], number))

# One-season tables: the POOLED variety where the report splits a crop by variety
table = pd.DataFrame(one_season, columns=["DES_crop", "DES_season", "Variety", "District", "Area_ha", "Page"])
pooled = table.groupby(["DES_crop", "DES_season"])["Variety"].transform(lambda v: (v == "POOLED").any())
table = table[~pooled | (table["Variety"] == "POOLED")]
table = table.groupby(["DES_crop", "DES_season", "District"], as_index=False)["Area_ha"].sum()

# Seasons side by side: kharif + rabi + summer must make the table's total for every district
columns = pd.DataFrame(side, columns=["DES_crop", "DES_season", "District", "Area_ha", "Page"])
columns = columns.groupby(["DES_crop", "DES_season", "District"], as_index=False)["Area_ha"].sum()
wide = columns.pivot_table(index=["DES_crop", "District"], columns="DES_season", values="Area_ha", aggfunc="sum")
seasons_sum = wide.drop(columns="TOTAL").sum(axis=1)
bad = (seasons_sum - wide["TOTAL"]).abs() > 2 + 0.01 * wide["TOTAL"]
for crop in sorted(set(wide[bad].index.get_level_values(0))):
    problems.append(f"{crop}: seasons do not add up to the total in {int(bad[crop].sum())} districts - left out")
good_crops = set(wide.index.get_level_values(0)) - set(wide[bad].index.get_level_values(0))
columns = columns[columns["DES_crop"].isin(good_crops) & (columns["DES_season"] != "TOTAL")]

des = pd.concat([table, columns], ignore_index=True)
des["Crop"] = des["DES_crop"].map(CROPS)
des["Season"] = des["DES_season"].map(SEASONS)
des = des.dropna(subset=["Crop", "Season"])
des = des.groupby(["District", "Crop", "Season"], as_index=False)["Area_ha"].sum()   # Ballari + Vijayanagara
des = des[des["Area_ha"] > 0]
des.insert(0, "Year", YEAR)
des.round(1).to_csv(OUT_FILE, index=False)

print(f"Saved {OUT_FILE}: {len(des)} rows | {des['District'].nunique()} districts | {des['Crop'].nunique()} crops: "
      f"{', '.join(sorted(des['Crop'].unique()))}")
print("State area by season (ha):", des.groupby("Season")["Area_ha"].sum().round().to_dict())
print("Checks failed:" if problems else "Every table passed its checks.")
for problem in problems:
    print("  ", problem)
