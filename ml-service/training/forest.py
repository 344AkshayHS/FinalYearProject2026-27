# The app's model settings, shared by every script that trains it or measures it
# (train_location_model.py, calibration.py, compare_taluk_labels.py, check_states.py).

from sklearn.ensemble import RandomForestClassifier

FEATURES = [
    "pH", "Nitrogen", "Organic_Carbon", "Clay", "Sand", "CEC",
    "Temperature", "Winter_Temperature", "Humidity", "Rainfall", "Monsoon_Rain_Share",
    "Post_Monsoon_Rain_Share", "Dry_Months", "Max_Temperature", "Solar_Radiation",
    "Elevation", "Slope", "Season",
]
# "Season" is the season the farmer sows in, as a number (the codes of build_dataset.py)
SEASONS = {"Kharif": 1, "Rabi": 2, "Summer": 3}
# Crops that stand in the field all year: plantation crops, fruit trees, and sugarcane and tapioca, which
# take about a year. They count in every season (build_dataset.py), and the app lists the season's field
# crops apart from them ("to sow this season").
YEAR_ROUND = ["sugarcane", "coconut", "arecanut", "cashewnut", "black pepper", "cardamom", "coffee",
              "banana", "mango", "grapes", "pomegranate", "papaya", "sapota", "tapioca"]

# Chosen on held-out districts (2026-09-24, season labels, "top 3 has the season's main crop"). A point is
# about 20 rows (one per 5% of its crop mix), so a leaf of 160 rows holds about 8 point-seasons: bigger
# leaves average more farms, and the forest is 30 times smaller in memory.
#   trees  min leaf   India top-3  Karnataka top-3  memory
#    400       3        88.1%          81.5%        7.0 GB
#    100       3        87.8%          81.6%        1.8 GB
#    200      40        88.0%          81.7%        0.8 GB
#    200      80        88.3%          82.2%        0.4 GB
#    200     160        88.5%          83.0%        0.2 GB   <- used
#    200     320        88.3%          82.4%        0.1 GB
TREES = 200
MIN_LEAF = 160


def random_forest():
    return RandomForestClassifier(n_estimators=TREES, min_samples_leaf=MIN_LEAF, random_state=42, n_jobs=-1)
