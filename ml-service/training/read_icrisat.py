# Reads the ICRISAT district-level workbook into one tidy table.
#
# Source: ICRISAT District Level Database (ICRISAT with the Tata-Cornell Institute),
#         http://data.icrisat.org/dld  ->  Crops -> "Area production yield" -> Unapportioned
#         -> Additional data -> "District wise and season wise yearly area and production".
# The download is manual (the portal has no direct file link). Keep the workbook at the path below
# and this script turns it into data/raw/icrisat_season_area.csv, which is what the training uses.
# The workbook itself is not on GitHub (it is 20 MB and can be downloaded again from the portal).
#
# Why we use it beside the data.gov.in statistics:
#   - it runs to 2019, while the data.gov.in series stops at 2014;
#   - it splits every crop into Kharif, Rabi and Summer, which the yearly series does not;
#   - the numbers are the same ones (both come from the agriculture department's returns):
#     checked against our own data for 2010-2014, they agree to within rounding.
#
# Run from the ml-service folder:  python training/read_icrisat.py

import pandas as pd

WORKBOOK = "data/raw/icrisat/area-production.xlsx"
OUT_FILE = "data/raw/icrisat_season_area.csv"
FIRST_YEAR = 2010          # older years are not used, and leaving them out keeps the file small
HEADER_ROWS = [6, 7, 8]    # crop / season / measure, above the five key columns

wide = pd.read_excel(WORKBOOK, header=HEADER_ROWS)
wide.columns = ["|".join(str(part) for part in column) for column in wide.columns]
keys = list(wide.columns[:5])
wide = wide.rename(columns=dict(zip(keys, ["state_code", "State", "district_code", "District", "Year"])))
wide["Year"] = pd.to_numeric(wide["Year"], errors="coerce")
wide = wide.dropna(subset=["Year"])
wide = wide[wide["Year"] >= FIRST_YEAR]

# Every area column is named "<crop>|<season>|Area"; production and yield are not used here
area_columns = [column for column in wide.columns if column.endswith("|Area")]
long = wide.melt(
    id_vars=["State", "District", "Year"],
    value_vars=area_columns,
    var_name="column",
    value_name="area_1000ha",
)
crop_and_season = long["column"].str.split("|", expand=True)
long["Crop"] = crop_and_season[0].str.strip()
long["Season"] = crop_and_season[1].str.strip()
long["Area_ha"] = pd.to_numeric(long["area_1000ha"], errors="coerce") * 1000
long["State"] = long["State"].astype(str).str.strip()
long["District"] = long["District"].astype(str).str.strip()
long["Year"] = long["Year"].astype(int)

long = long.dropna(subset=["Area_ha"])
long = long[long["Area_ha"] > 0]
long[["State", "District", "Year", "Crop", "Season", "Area_ha"]].to_csv(OUT_FILE, index=False)

print(f"Saved {OUT_FILE}: {len(long)} rows | {long.State.nunique()} states | "
      f"{long.Crop.nunique()} crops | {long.Year.min()}-{long.Year.max()}")
print("Seasons:", ", ".join(sorted(long.Season.unique())))
