# GreenRoot

Location-based crop recommendation for Karnataka farmers. The farmer shares their GPS location (or picks a
district), and GreenRoot reads the soil and long-term climate of that exact spot and recommends crops, with an
explanation, in English or Kannada (one tap in the header switches the whole app).
A built-in crop helper chat answers what a crop is called, how much water it needs and how long it takes to grow.

Farmers can also:
- enter their own soil test values (Soil Health Card): pH and organic carbon replace the soil map in the prediction,
  and N, P and K get a Low / Medium / High rating
- see how much water to give a crop **today** (FAO method with today's forecast and the days since sowing)
- tell us how a crop they grew actually did; this feedback is used for checked retraining (see below)

Final-year B.E. (CSE – AI & ML) project, Mangalore Institute of Technology & Engineering.

## How it works

```
Phone app (Expo)  ──►  Backend (Node + Express + PostgreSQL)  ──►  ML service (Python + FastAPI)
  GPS / district         accounts, district lookup, history           soil (SoilGrids), climate (NASA POWER),
                                                                       terrain (Open-Meteo),
  results, Kannada,      saves every recommendation                   Random Forest, SHAP + LIME
  crop helper chat
```

## Folders

| Folder | What is inside |
|---|---|
| `frontend/` | Expo app: `src/app` (screens), `src/components`, `src/lib` (API, English/Kannada text, location, crop facts and the crop helper chat) |
| `backend/` | Express API: `src/routes` (users, location, recommend, chat, weather, feedback), `scripts/` (feedback export), `src/services`, `db/schema.sql`, `data/` (district boundaries and names) |
| `ml-service/` | `app/` (the running service), `training/` (scripts that build the data and train the model), `artifacts/` (trained model and results), `data/` |

## Running it on a new PC

**Install first:** [Node.js](https://nodejs.org) 20 or newer, [Python 3.13](https://www.python.org),
[PostgreSQL](https://www.postgresql.org/download/) (remember the password you set for the `postgres` user),
and Git. On the phone: the **Expo Go** app (Play Store / App Store).

All data is in the repository, so nothing needs to be downloaded again. The trained model file is not
(it is 121 MB, over GitHub's 100 MB limit), so it is built once on your PC in step 4.
All commands below are for Windows PowerShell, starting in the project folder.

**1. Get the code**
```
git clone https://github.com/344AkshayHS/FinalYearProject2026-27.git
cd FinalYearProject2026-27
```

**2. Database** (use your PostgreSQL port: 5432 is the default, this project was built on 9999)
```
psql -U postgres -p 5432 -c "CREATE DATABASE greenroot"
psql -U postgres -p 5432 -d greenroot -f backend/db/schema.sql
```
(`psql` is in `C:\Program Files\PostgreSQL\<version>\bin` if it is not found.)
An older GreenRoot database only needs the later files: `backend/db/002_soil_test_and_feedback.sql`,
`003_admin.sql` and `004_terrain_and_climate.sql`.

**3. Settings.** `.env` files are never on GitHub (they hold passwords and keys). Copy each example and fill it in:

| File | What to put in |
|---|---|
| `backend/.env` (from `backend/.env.example`) | your PostgreSQL password and port in `DATABASE_URL`; optional `GEMINI_API_KEY` for the chat |
| `ml-service/.env` (from `ml-service/.env.example`) | nothing needed to run the app (the data.gov.in key is only for re-training) |
| `frontend/.env` (from `frontend/.env.example`) | nothing: leave `EXPO_PUBLIC_API_URL` empty. The app finds the backend on the PC running `npx expo start`, so it survives a changed Wi-Fi address. Fill it in only for a built APK, or when the backend runs on another PC |

**4. Install the libraries** (first time only)
```
cd ml-service
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python training/train_location_model.py     # builds artifacts/crop_model.joblib (~35 min, no internet)
cd ..\backend
npm install
npm run create-admin -- <username> <password>     # optional: login for the ML dashboard
cd ..\frontend
npm install
cd ..
```

**5. Start the three parts**, each in its own terminal, in this order:
```
cd ml-service
.venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000
```
```
cd backend
npm run dev
```
```
cd frontend
npx expo start
```

**6. Open it on the phone**
- Connect the phone to the **same Wi-Fi** as the PC.
- Open **Expo Go** and scan the QR code from the third terminal (iPhone: scan with the Camera app).
- If Windows asks whether to allow Node.js or Python on the network, click **Allow** (private networks).
- Test the connection: the phone's browser should open `http://<PC IP>:4000` and show "GreenRoot backend is running".
- If the Wi-Fi changes, just restart `npx expo start`: the app follows the PC's new address by itself.
- College or public Wi-Fi often blocks phones from reaching the PC. Use a phone hotspot for the PC instead.

**Installable app (APK, optional).** The app itself can be built with `eas build -p android --profile preview`
(needs a free Expo account; a new developer first runs `npx eas-cli@latest init` to link their own project).
The APK still needs the backend and ML service running on a PC it can reach.

## ML dashboard (admin)

Profile → **Admin login** opens the ML dashboard (admin sessions last 12 hours and are kept only in memory in the app).
It shows, from real data only: how a recommendation is made step by step, live status of the database, ML service
and Gemini key, the training data, the 7-model comparison, feature importance, SHAP–LIME agreement, the conformal
set, calibration, the first experiment on the original CSV, feedback retraining runs, and app activity.
Tapping a recent recommendation shows every stored step: location, soil, climate, top 5 crops, SHAP and LIME.
Data comes from `GET /admin/overview` (backend) and `GET /report` (ML service, `app/report.py`).

## Training the model

Run from `ml-service/` with the virtual environment active, in this order:

| Step | Script | What it does |
|---|---|---|
| 1 | `training/fetch_crop_stats.py` | Downloads district crop statistics for India from data.gov.in (needs `DATA_GOV_API_KEY`), 1997-2015 |
| 2 | `training/read_icrisat.py` | Reads the ICRISAT workbook downloaded by hand (see below) into `data/raw/icrisat_season_area.csv`: newer district crop areas, 2010-2019, split by season |
| 3 | `training/fetch_location_features.py` | Picks sample points inside every district and reads their soil, climate and terrain (slow, resumable; run with `PYTHONPATH=.`) |
| 4 | `training/build_dataset.py` | Joins crop shares (labels) with the points (features). Where ICRISAT has 2015-2019 figures for a district they replace the older ones; coffee comes from `data/raw/plantation_area.csv` and the fruit and vegetable crops from `data/raw/horticulture_area.csv`, because the agriculture series counts neither |
| 5 | `training/train_location_model.py` | Compares 7 models on held-out districts and saves the winner (must support exact tree SHAP; Random Forest wins today) |
| 6 | `training/explain.py` | SHAP vs LIME agreement per crop |
| 7 | `training/make_district_points.py` | One reference point per Karnataka district (for manual district choice) |
| 8 | `training/calibration.py` | Checks that a crop's probability matches the real share of similar land growing it, and how often the top crop is the area's main crop (used for "Strong / Good / Possible choice" in the app) |
| 9 | `training/check_districts.py` | Answers "pick a district and see if it is right" for all 30 Karnataka districts at once: is the crop really grown most there inside the model's top 3? Needs no server |

Steps 5, 8 and 9 take a while together, so `training/run_all.ps1` runs the training, calibration and
explanation steps one after another and writes everything to `artifacts/retrain.log`:
`powershell -ExecutionPolicy Bypass -File training/run_all.ps1`

Step 2 needs a file the portal only gives to a signed-in visitor, so it is downloaded by hand once:
on [ICRISAT's District Level Database](http://data.icrisat.org/dld/) choose the unapportioned, season-wise
area and production tables and save the workbook as `data/raw/icrisat/area-production.xlsx`. The workbook
itself is not in the repository (20 MB), but the CSV the script writes is, so steps 3-8 run without it.
Reading it needs `openpyxl`, which is in `requirements.txt` for training only - the app never opens a workbook.

`data/raw/plantation_area.csv` and `data/raw/horticulture_area.csv` are in the repository as plain CSVs,
each row carrying the publication it was read from in its `Source` column. They were copied once out of
the Coffee Board and Horticultural Statistics tables, because those are published as PDFs, not as data
files - so the training pipeline needs no PDF reader.

**Learning from farmer feedback.** In `backend/` run `npm run export-feedback`, then in `ml-service/` run
`training/retrain_with_feedback.py`. "Good" and "average" reports are added as farm points growing that crop
("poor" is only counted). The script scores a Random Forest with and without the feedback on held-out districts
(same folds as step 5) and saves the new model only if accuracy for India and Karnataka drops by less than
0.5 percentage points. Every run is logged in `artifacts/feedback_retraining_log.csv`.

Results are saved in `ml-service/artifacts/` (`model_comparison.csv`, `shap_lime_agreement.csv`,
`crop_model_info.json`). The evaluation follows the SRVP-Ag rules from our literature paper:
district hold-out with macro-F1, measured SHAP–LIME agreement, and a 90% conformal prediction set.

`training/original_csv_*.py` is the first experiment on the team's original dataset. It is kept for the report
(it showed the dataset's labels carry no signal) and is not used by the app.

## Data sources

| Data | Source | Licence |
|---|---|---|
| Crop area by district, 2015–2019 (the labels the model learns) | ICRISAT District Level Database, ICRISAT and Tata-Cornell Institute | Free for research, with attribution |
| Crop area by district, 2010–2014 (districts ICRISAT does not cover) | data.gov.in, Ministry of Agriculture & Farmers Welfare (DES) | Government Open Data Licence – India |
| Coffee planted area by district, 2011–12 | Coffee Board of India, *Database on Coffee* (March 2013), table 1.3 | Government of India |
| Fruit and vegetable area by district, 2016–17 (mango, grapes, pomegranate, tomato, sapota, papaya) | *Horticultural Statistics at a Glance 2018*, Ministry of Agriculture & Farmers Welfare, table 7.5 | Government of India |
| Soil (pH, nitrogen, organic carbon, clay, sand, CEC) | ISRIC SoilGrids v2.0 | CC BY 4.0 |
| Climate (20-year averages: temperature, winter and hottest month, humidity, rain, monsoon and post-monsoon share, dry months, sunlight) | NASA POWER | Free, public |
| Height above sea level and steepness | Open-Meteo elevation API (Copernicus DEM 90 m) | CC BY 4.0 |
| Karnataka district boundaries (Census 2011) | civictech-India/INDIA-GEO-JSON-Datasets | No licence stated |
| India district boundaries | geohacker/india | MIT |
| Taluk name, and district lookup fallback | OpenStreetMap Nominatim | ODbL |
| Today's evaporation, rain and humidity (daily water) | Open-Meteo forecast API | CC BY 4.0 |
| Crop factors (Kc) and growth stages | FAO Irrigation Water Management Training Manual 3, Tables 7, 8, 10, 11, 12b | FAO |
| Soil test ratings (Low / Medium / High) | TNAU Agritech Portal, Rating Chart for Soil Test Data | – |

## Crop helper facts

The chat (`frontend/src/lib/crop-info.ts`) answers only from checked figures; where a source had no number,
it says so instead of guessing. Sources: TNAU Agritech Portal (water requirement table, crop pages),
TNAU/eagri lecture notes on crop water requirement, FAO Irrigation Water Management Training Manual 3
(Tables 6 and 14), ICRISAT pigeonpea maturity groups. Water figures are for the whole crop; the daily figure is
that total divided by the crop's duration, so real daily need is lower early and higher at flowering.

**Optional LLM (Gemini).** With `GEMINI_API_KEY` set in `backend/.env`, the backend's `/chat` route asks Gemini to
phrase the answer. Gemini receives only the facts for the crop being asked about, and any reply containing a number
that is not in those facts is thrown away. The app always adds the source line itself. Without a key, or if Gemini
fails or hits its limit, the app quietly uses the rule-based answer.
