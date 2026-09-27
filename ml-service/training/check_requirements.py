# How often would the FAO EcoCrop requirements (artifacts/crop_requirements.csv) wrongly call a crop
# "unsuited" to a place where our statistics say it is really grown? Decides which checks app/suitability.py
# may use to move a crop down the list, and which it may only show.
#
# Every place (sample point) and season with every crop really grown there, with the point's soil-map pH,
# the season's temperature (winter temperature in rabi) and the yearly rainfall.
#
# Run from the ml-service folder:  python training/check_requirements.py

import numpy as np
import pandas as pd

requirements = pd.read_csv("artifacts/crop_requirements.csv").set_index("Crop")
data = pd.read_csv("data/processed/india_dataset.csv",
                   usecols=["State", "Latitude", "Longitude", "Season", "Crop", "pH", "Temperature", "Winter_Temperature", "Rainfall"])
data = data.drop_duplicates(["Latitude", "Longitude", "Season", "Crop"])
data["Season_Temperature"] = np.where(data["Season"] == 2, data["Winter_Temperature"], data["Temperature"])
need = requirements.loc[data["Crop"]]


def outside(values, low, high):
    return ((values < low.values) | (values > high.values)) & low.notna().values & high.notna().values


checks = {
    "pH outside its absolute range": outside(data["pH"].values, need["pH_min"], need["pH_max"]),
    "temperature outside its absolute range": outside(data["Season_Temperature"].values, need["Temp_min"], need["Temp_max"]),
    "rainfall outside its absolute range": outside(data["Rainfall"].values, need["Rain_min"], need["Rain_max"]),
    "pH outside its optimal range": outside(data["pH"].values, need["pH_opt_min"], need["pH_opt_max"]),
}
for area, rows in [("India", np.ones(len(data), bool)), ("Karnataka", (data["State"] == "Karnataka").values)]:
    print(f"\n{area}: {rows.sum()} crops really grown (place and season) - share the requirements call unsuited:")
    for name, flagged in checks.items():
        print(f"  {name:40s} {flagged[rows].mean():6.1%}")
