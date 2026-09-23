# Original experiment, step 1: clean the team's first dataset (GreenRoot_TrainReady_Dataset.csv).
# This experiment showed the dataset's crop labels carry no signal, so the app no longer uses it;
# it is kept as the "single benchmark" comparison for the report.
#
# What this does (decisions agreed with the team):
#   - removes exact duplicate rows
#   - keeps the Kaggle Benchmark rows aside, only for the "single benchmark" comparison
#   - drops the generic "pulses" label (it overlaps with chickpea, mungbean, etc.)
#   - drops crops with fewer than 30 rows
#   - standardises each source separately (z-score), because the sources use different units
#
# The raw CSV is never modified.
# Run from the ml-service folder:  python training/original_csv_prepare.py

import pandas as pd

RAW_FILE = "data/raw/GreenRoot_TrainReady_Dataset.csv"
OUT_DIR = "data/processed/"

FEATURES = ["N", "P", "K", "pH", "Temperature", "Humidity", "Rainfall"]
BENCHMARK_SOURCE = "Kaggle Benchmark"
MIN_ROWS_PER_CROP = 30


def standardise(df, scalers):
    df = df.copy()
    for source, stats in scalers.items():
        rows = df["Source"] == source
        for f in FEATURES:
            df.loc[rows, f] = (df.loc[rows, f] - stats[f]["mean"]) / stats[f]["std"]
    return df


df = pd.read_csv(RAW_FILE)
print("Raw rows:", len(df))

df = df.drop_duplicates()
print("After removing duplicates:", len(df))

# Kaggle benchmark goes to its own file
benchmark = df[df["Source"] == BENCHMARK_SOURCE]
df = df[df["Source"] != BENCHMARK_SOURCE]
print("Kaggle benchmark rows set aside:", len(benchmark))

# Drop the generic "pulses" label and very small crops
df = df[df["Crop"] != "pulses"]
counts = df["Crop"].value_counts()
small_crops = counts[counts < MIN_ROWS_PER_CROP].index.tolist()
df = df[~df["Crop"].isin(small_crops)]
print(f"Dropped {len(small_crops)} crops with fewer than {MIN_ROWS_PER_CROP} rows:", sorted(small_crops))
print("Consolidated rows:", len(df), "| crops:", df["Crop"].nunique())

# Mean and std of every feature, for every source
scalers = {}
for source, rows in pd.concat([df, benchmark]).groupby("Source"):
    scalers[source] = {f: {"mean": rows[f].mean(), "std": rows[f].std()} for f in FEATURES}

standardise(df, scalers).to_csv(OUT_DIR + "consolidated.csv", index=False)
standardise(benchmark, scalers).to_csv(OUT_DIR + "benchmark_kaggle.csv", index=False)

print("\nRows per crop:")
print(df["Crop"].value_counts().to_string())
