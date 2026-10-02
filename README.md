# GreenRoot

Location-based crop recommendation for Karnataka farmers. The farmer shares their GPS location, and GreenRoot
reads the soil and long-term climate of that exact spot and recommends crops, with an explanation, in English or
Kannada (one tap in the header switches the whole app). Instead of GPS a farmer can pick the place: a state, then
one of its districts (`GET /location/states`, `GET /location/districts?state=`), then, for Karnataka, optionally one of
its taluks. A Karnataka district or taluk gets an answer for that whole area: the model averaged over its sample farms.
We have sample farms for Karnataka only, so a district of another state is answered for one spot in its middle
(`district_middle` in the `/recommend` answer), and the app says so and points to GPS for an exact answer. Beside
the recommendation the app shows what farmers really grow most in that taluk (Agriculture Census) or district
(crop statistics). Taluks are Karnataka only: we have taluk data nowhere else.
Answers change with the season: the farmer picks Kharif, Rabi or Summer (it starts at the season of today's date),
and the model, which has the season as one of its inputs, names the crops sown in that season. Plantation crops and
fruit trees are marked "Stands all year", and where the district sows little in that season (summer almost
everywhere) the app says so. When a year-round crop is in the top 3, the app also lists the season's top field crops
("To sow this Rabi"): on the coast in rabi that is rice and black gram, under the arecanut and coconut.
That list only names crops the district's own statistics sow in that season (1% or more of its field crops,
`artifacts/season_field_crops.csv`; in Karnataka from the 2022-23 crop survey), ordered by the model's probability
times the crop's share of the sowing then: in a Karnataka taluk (GPS or picked) the taluk's own field crops
(Agriculture Census, split into seasons by the crop survey, `training/taluk_season_crops.py`), else the district's.
Checked on districts the model never saw, scoring each census year with the other year's shares, the taluk's main
crop came first 68% of the time (top 3: 91%), against 58% with the district's shares and 49% for the model alone;
Hunsur and Periyapatna now start their kharif list with tobacco, as the census says. Chikkamagaluru's rabi list is
chickpea, jowar and ragi, as the crop survey says. Every crop also carries short notes from its FAO EcoCrop needs: whether it suits the farmer's own tested soil pH,
whether normal rain (IMD) is enough on rain-fed land, whether the season is too hot or cold, and whether it needs a
fertile soil where the test shows low nitrogen. A crop that cannot grow at the tested pH or in the season's temperature
moves below the others. When the "to sow" list starts with another crop than the model's top one - the top crop
stands all year (arecanut, coconut, coffee), or the taluk's own crops put another first - the headline
becomes the season's best crop to sow - the first of the "to sow" list, explained with its own SHAP and LIME - and
a year-round top crop gets its own card, "year-round crop that suits this land best": what grows best on the land and
what to sow this season are two different questions. "See top 10 crops" lists the next most likely crops (up to 10 in all), and a card lists the vegetables, herbs, spices and
plantation crops (which the crop statistics do not count) that suit the land by their needs, a few of each. A seasonal
crop's rainfall need is checked against that season's normal rain (IMD monthly normals: kharif June-September, rabi
October-January, summer February-May), a plantation crop's against the year's; a seasonal crop short of rain is kept
but marked "needs irrigation" (hidden on rain-fed land), while too much rain, or too little for a plantation crop,
leaves it out. The year-round card lists the land's four best year-round crops. Beside it, the app shows what the district sowed most in that
season (hectares, from the same survey), so the model's answer and the official figures can be compared.
A built-in crop helper chat answers what a crop is called, how much water it needs and how long it takes to grow.

Farmers can also:
- say whether the land is rain-fed or irrigated. The app shows this season's rain against normal (NASA POWER, IMD
  categories) and, on rain-fed land in Karnataka, marks as "Needs irrigation" the crops that most farmers of the taluk
  or district irrigate - at least half of the crop's land irrigated in every recent Agriculture Census - naming the
  crops they mostly grow on rain
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
  crop helper chat                  ▲
                                    │
Website (React, in a browser)  ─────┘   the same backend, the same answers, the same English and Kannada
```

## Folders

| Folder | What is inside |
|---|---|
| `frontend/` | Expo app: `src/app` (screens), `src/components`, `src/lib` (API, English/Kannada text, location, crop facts and the crop helper chat) |
| `web/` | The website (React + Vite): `src/pages`, `src/components`, `src/lib`, `src/styles.css`. Read `web/README.md` |
| `backend/` | Express API: `src/routes` (users, location, recommend, chat, weather, feedback), `scripts/` (feedback export), `src/services`, `db/schema.sql`, `data/` (district and taluk boundaries, district names, crops grown per taluk and district) |
| `ml-service/` | `app/` (the running service), `training/` (scripts that build the data and train the model), `artifacts/` (trained model and results), `data/` |

## Running it on a new PC

**Install first:** [Node.js](https://nodejs.org) 20 or newer, [Python 3.13](https://www.python.org),
[PostgreSQL](https://www.postgresql.org/download/) (remember the password you set for the `postgres` user),
and Git. On the phone: the **Expo Go** app (Play Store / App Store).

All data is in the repository, so nothing needs to be downloaded again. The trained model file
(`ml-service/artifacts/crop_model.joblib`, about 30 MB) is not, so it is built once on your PC in step 4.
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
`003_admin.sql`, `004_terrain_and_climate.sql`, `005_season.sql` and `006_session_security.sql` (the last one signs
everybody out once: see "Security" below).

**3. Settings.** `.env` files are never on GitHub (they hold passwords and keys). Copy each example and fill it in:

| File | What to put in |
|---|---|
| `backend/.env` (from `backend/.env.example`) | your PostgreSQL password and port in `DATABASE_URL`; optional `GROQ_API_KEY` and `GEMINI_API_KEY` for the chat |
| `ml-service/.env` (from `ml-service/.env.example`) | nothing needed to run the app (the data.gov.in key is only for re-training) |
| `web/.env` (from `web/.env.example`) | nothing, unless the backend is not at `http://localhost:4000` (then set `API_TARGET`) |
| `frontend/.env` (from `frontend/.env.example`) | nothing: leave `EXPO_PUBLIC_API_URL` empty. The app finds the backend on the PC running `npx expo start`, so it survives a changed Wi-Fi address. Fill it in only for a built APK, or when the backend runs on another PC |

**4. Install the libraries** (first time only)
```
cd ml-service
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python training/train_location_model.py     # builds artifacts/crop_model.joblib (~1 h 40 min, no internet)
cd ..\backend
npm install
npm run create-admin -- <username> <password>     # optional: login for the ML dashboard
cd ..\frontend
npm install
cd ..\web
npm install     # only for the website
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

## Website

The website has the same pages as the phone app (login, home with location, season and soil test, results, water
plan, feedback, crop helper chat, profile with history, the admin ML dashboard) in English and Kannada. It lives in
`web/` and does not change anything in `frontend/`: the phone app works exactly as before.

With the ML service and the backend running (step 5), in a fourth terminal:
```
cd web
npm run dev
```
Open **http://localhost:5173**. To serve it from the backend instead (one address, one port): `cd web`,
`npm run build`, restart the backend, open **http://localhost:4000**.
- The browser shares its position only on `localhost` or an https address. Opened by the PC's Wi-Fi address
  (`http://192.168...`), location is refused and the farmer picks the district from the list instead.
- The website reads the phone app's text, crop facts, chat rules and water formula straight from `frontend/src/lib`
  (it never changes them), so a Kannada fix or a new crop fact shows in both. How it is built: `web/README.md`.

## Security

Both apps talk to the same backend, so most of it is done there (`backend/src/auth.js`, `rate-limit.js`, `server.js`):
- **Logins.** Passwords are stored as scrypt hashes (at least 8 characters). A login token is stored only as a SHA-256
  hash, so a copy of the database cannot be used to log in. Farmer logins end after 30 days, admin logins after 12 hours.
  A wrong phone number takes as long to answer as a wrong password, so nobody can find out who has an account.
- **Phone app:** the token is in SecureStore (the phone's keystore), and the app logs out by itself when the server says
  the login has ended. It refuses plain `http://` to a public address (only localhost and your own Wi-Fi are allowed).
- **Website:** the token is in an `httpOnly` cookie (`SameSite=Strict`, `Secure` on https), so JavaScript on the page
  can never read it. A change made with that cookie must come from our own address (`Origin` check plus the
  `X-Client: web` header), so another website cannot make the browser send one for the farmer.
- **Limits.** 5 wrong passwords lock a name for 15 minutes; 20 logins or sign-ups per 15 minutes per address;
  recommendations 30 an hour and chat questions 60 an hour per farmer. `/recommend` now needs a login.
- **Headers** (`nosniff`, no framing, no referrer, a strict Content-Security-Policy for the website), request size limit.
- **Known limit:** the chat takes the crop facts from the app (`frontend/src/lib/crop-info.ts`), so a logged-in user can
  only change their own answers; the server still refuses figures not in those facts and any chemical dose.
- **Settings for a real server:** `COOKIE_SECURE=true` (https), `WEB_ORIGIN` (the website's address), `TRUST_PROXY=1`
  (behind nginx or a host's load balancer). See `backend/.env.example`. Keep keys and passwords in `.env` files only.
- Tests: `cd backend; npm test`.

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
| 2b | `training/read_des_estimates.py` | Reads Karnataka's crop-survey areas by district and season from the DES "Fully Revised Estimates" report (2022-23, downloaded if missing; needs `pdftotext`, which comes with Git for Windows) into `data/raw/karnataka_des_season_area.csv`. Every table is checked against its own totals. Used for which crops each Karnataka district sows in a season, the order of the "to sow" list, and the app's "sown most in this district this season" card; not for the training labels (those are per taluk) |
| 2c | `training/read_ecocrop.py` | What every crop needs (optimal and absolute soil pH, temperature, rainfall, soil texture, fertility) from FAO EcoCrop, for the 57 model crops and 22 herbs, spices and plantation crops the crop statistics do not count (tulsi, ashwagandha, aloe vera, lemongrass, curry leaf, rubber, tea, cocoa, clove...), into `artifacts/crop_requirements.csv` |
| 2d | `training/read_imd_rainfall.py` | IMD's normal yearly rainfall per district (1951-2000, data.gov.in) into `artifacts/district_rainfall.csv`, for checking crops' rainfall needs in real millimetres (NASA POWER's coarse grid reads about twice the rain in Mysuru, Davanagere and Haveri) |
| 2e | `training/check_requirements.py` | How often the EcoCrop ranges wrongly call a crop "unsuited" where our statistics say it is really grown: 0% (Karnataka) / 2% (India) for temperature, 3% for pH, 15% for rainfall, 31-42% for the optimal pH range - so only temperature and the farmer's own tested pH may move a crop down the list |
| 3 | `training/fetch_taluk_crops.py` | Downloads the crop area of every Karnataka taluk from the Agriculture Census 2010-11 and 2015-16 (table 6B, plus each taluk's total cropped area) into `data/raw/karnataka_taluk_crop_area.csv`. Slow (several hours) and resumable |
| 4 | `training/make_taluk_map.py` | Builds `backend/data/karnataka_taluks.geojson`: the Census 2011 taluk shapes, labelled with the Agriculture Census taluk codes |
| 4b | `training/fetch_kag_crops.py` | Crop area per taluk from Karnataka At A Glance (Karnataka DES, 2019-22) for 32 crops, including cowpea and field bean (avare), which the census does not count. Today's taluks are placed in the Census 2011 taluks with the KGIS taluk map. Output `data/raw/karnataka_kag_crops.csv`. Takes a minute |
| 5 | `training/fetch_location_features.py` | Picks sample points (10 per Karnataka taluk, 10 per district elsewhere) and reads their soil, climate and terrain (slow, resumable; run with `PYTHONPATH=.`) |
| 6 | `training/build_dataset.py` | Joins crop shares (labels) with the points (features), once per season (Kharif, Rabi, Summer; see "Seasons" below). Karnataka points get their taluk's crop mix (step 3); elsewhere the district's: where ICRISAT has 2015-2019 figures they replace the older ones (a crop ICRISAT does not report in a state, such as Karnataka's sugarcane, keeps its 2010-2014 area); coffee comes from `data/raw/plantation_area.csv` and the fruit and vegetable crops from `data/raw/horticulture_area.csv`, because the agriculture series counts neither. Also writes `backend/data/karnataka_crop_facts.json` (what is really grown most in each taluk and district, shown in the app) and `artifacts/season_sown_share.csv` (how each district's field crops divide between the seasons) |
| 7 | `training/compare_taluk_labels.py` | Checks that taluk labels beat district labels on held-out Karnataka districts, for GPS answers and for district answers. With `--truth <file>` two label versions are scored against the same yardstick (both scored against the 5-year census + DES taluk mix: `artifacts/taluk_label_comparison.csv` for the chosen labels vs `taluk_label_comparison_census_only.csv`). It also measures how much a taluk picked by hand should count against its district, and saves that weight to `artifacts/taluk_weight.json` for the ML service (a taluk without census figures is answered for its district) |
| 8 | `training/train_location_model.py` | Compares 7 models on held-out districts and saves the winner (must support exact tree SHAP; Random Forest wins today) |
| 9 | `training/explain.py` | SHAP vs LIME agreement per crop |
| 10 | `training/make_district_points.py` | Every Karnataka sample point with its district and taluk, for the ML service: a district (or taluk) picked by hand is answered by averaging the model over all its points |
| 11 | `training/calibration.py` | Checks that a crop's probability matches the real share of similar land growing it, and how often the top crop is the area's main crop (used for "Strong / Good / Possible choice" in the app) |
| 12 | `training/check_districts.py` | Answers "pick a district and see if it is right" for all 30 Karnataka districts in every season, the way the app answers it: is the crop really grown most there in that season inside the model's top 3? Needs no server |
| 13 | `training/check_states.py` | Held-out accuracy per state and per season (`artifacts/state_accuracy.csv`), and the districts that have no crop statistics to test against |
| 14 | `training/taluk_season_crops.py` | Each Karnataka taluk's field crops per season (census crop shares, split into seasons by the 2022-23 crop survey), `artifacts/taluk_season_crops.csv`: the ML service orders a taluk's "to sow this season" list by them |
| 15 | `training/export_recommendations.py` | The app's answer for every Karnataka district and taluk in every season, for reading in Excel: `artifacts/karnataka_recommendations.csv` (top 5, "to sow this season", what is really grown there) and `artifacts/karnataka_all_crops.csv` (every crop's percent) |

Steps 7 to 13 take a while together, so `training/run_all.ps1` runs them one after another (step 8 first) and
writes everything to `artifacts/retrain.log`. The model's settings are in `training/forest.py`, shared by every script:
`powershell -ExecutionPolicy Bypass -File training/run_all.ps1`

**Seasons.** Every sample point is in the data three times, once per season, with the crop mix of that season,
and `Season` (1 Kharif, 2 Rabi, 3 Summer) is one of the model's inputs. A crop's land is split between the seasons
the way its district sows it (ICRISAT 2015-2019 and data.gov.in 2010-2014, which record every crop by season;
autumn and winter rice count as kharif); a district without figures for a crop uses its state's split, then
India's. Plantation crops, fruit trees, sugarcane and tapioca stand in the field all year, so they count in every
season. Karnataka's tobacco is recorded only as "Whole Year" and is planted from April to July, so it is kharif.
Avare has no season figures of its own; the statistics count it among the "other pulses", so it takes the
district's split of Other Kharif pulses and Other Rabi pulses (checked on cowpea, which has its own figures).
The season of every result is saved with it (`recommendations.season`), and feedback retraining uses it.
The Agriculture Census and DES count whole years, so a Karnataka taluk's crops are split like its district's.
The app sends the season the farmer picks; without one the ML service uses the season of today's date
(June-September Kharif, October-January Rabi, February-May Summer).

**Training data size.** `data/processed/india_dataset.csv` has 423,012 rows: 143,253 Kharif, 144,468 Rabi and
135,291 Summer. They are area-weighted copies, not 423,012 separate records. Each crop at a point is written once
per 5% of its district's area (20 times for a crop that covers all of it), so the copies work as a weight and
rice on 60% of a district counts more than cotton on 3%. Without the copies there are 82,771 distinct crop
records (31,142 Kharif, 31,347 Rabi, 20,282 Summer) at 7,140 sample points, in 568 statistics districts, for 57
crops. The soil and climate values of a point are the same in every season; only `Season`, the crops and their
shares change. The crop labels come from district statistics, so points in one district share a label. That is
why the accuracy check (`GroupKFold`, 5 folds) holds out whole districts: a copy of a row never sits in both
the training and the test part. The final model is then trained on all rows.

**Karnataka boundaries.** The data uses the Census 2011 boundaries: 30 districts (Vijayanagara, made in 2021, is
part of Ballari) and 175 taluk shapes (the 176 Census 2011 taluks; Aland and Afzalpur share one). Together they
cover all of Karnataka; today's 31 districts and about 240 taluks are later splits of the same land. Ramanagara
district was renamed Bengaluru South on 23 May 2025 (the app shows "Bengaluru South (Ramanagara)"; its crop data is
filed under the old name).

**States and union territories.** India has 28 states and 8 union territories. The crop statistics and the model's
training data are older than three changes, so they hold 25 states and 4 union territories (Chandigarh, Dadra and
Nagar Haveli, Jammu and Kashmir, Puducherry): Telangana (2014) is inside Andhra Pradesh, Ladakh (2019) inside Jammu and
Kashmir, and Dadra and Nagar Haveli is not yet joined with Daman and Diu (2020); Manipur and Mizoram have no figures.
The model reads soil and climate at the farm's own GPS point, so this does not change its answers, but the
dashboard says it. The place shown to the farmer is today's: `currentState` in `backend/src/districts.js` corrects the
older map, so a farm in Hyderabad reads "Telangana" and one in Leh "Ladakh". Fixing the training data itself would
mean rebuilding the dataset and retraining, which has not been done.

**Places with no crop statistics.** 28 districts have soil and climate sample points but no crop figures: all of
Manipur (9) and Mizoram (8), Delhi, Daman and Diu, the Andaman and Nicobar Islands, and the city districts Hyderabad,
Greater Bombay, Chennai, Kolkata, Kanpur and Upper Dibang Valley. The model still answers there from the soil and
climate of the exact spot, but the answer could not be tested, so a GPS answer in one of them carries a warning
(`untested_place` in the `/recommend` answer, `noStatsHere` in the texts). The list comes from
`training/list_untested_places.py` (run from `ml-service/`; it only compares two files, no training) and is saved in
`backend/data/untested_places.json`. Karnataka has figures for all 30 of its districts.

**Karnataka taluk labels.** Each taluk's crop mix averages every year that reports a crop: the Agriculture
Census 2010-11 and 2015-16 and Karnataka DES 2019-22 (coffee and the spices census only; cowpea and avare DES
only). For 16 taluks - all of Uttara Kannada, Udupi and Kundapura, and the three Yadgir taluks - the census
portal failed during the 2010-11 download, so they have 2015-16 only; running step 3 again
(`python training/fetch_taluk_crops.py 2010`) fetches just those, then rebuild and retrain.

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
| Crop area by Karnataka taluk, 2010-11 and 2015-16 (the Karnataka labels, and the taluk card in the app) | Agriculture Census, table 6B, Department of Agriculture & Farmers Welfare, agcensus.da.gov.in | Government of India |
| Crop area and total sown area by Karnataka taluk, 2019-22 (32 crops, with cowpea and avare) | Karnataka At A Glance, Directorate of Economics and Statistics, Government of Karnataka (kgis.ksrsac.in/kag); taluk map from KGIS | Government of Karnataka |
| This season's rain against normal (the app's rain check) | NASA POWER daily rain (June to date vs 2001-2020 for the same days); categories as used by the India Meteorological Department | Free, public |
| Crop area by Karnataka district and season, 2022-23, from the crop survey ("to sow" list, "sown most here this season" card) | Fully Revised Estimates of Area, Production and Yield of Principal Crops, Directorate of Economics and Statistics, Government of Karnataka (des.karnataka.gov.in) | Government of Karnataka |
| Crop area by district, 2015–2019 (the labels the model learns outside Karnataka) | ICRISAT District Level Database, ICRISAT and Tata-Cornell Institute | Free for research, with attribution |
| Crop area by district, 2010–2014 (districts ICRISAT does not cover) | data.gov.in, Ministry of Agriculture & Farmers Welfare (DES) | Government Open Data Licence – India |
| How each crop's land divides between Kharif, Rabi and Summer (the season labels) | The same two series, which record every crop by season: ICRISAT 2015–2019 and data.gov.in 2010–2014 | As above |
| Coffee planted area by district, 2011–12 | Coffee Board of India, *Database on Coffee* (March 2013), table 1.3 | Government of India |
| Fruit and vegetable area by district, 2016–17 (mango, grapes, pomegranate, tomato, sapota, papaya) | *Horticultural Statistics at a Glance 2018*, Ministry of Agriculture & Farmers Welfare, table 7.5 | Government of India |
| Crop needs: soil pH, temperature, rainfall, soil texture, fertility (57 model crops and 22 herbs, spices and plantation crops) | FAO EcoCrop database (copy used by github.com/OpenCLIM/ecocrop) | FAO |
| Normal yearly rainfall per district, 1951-2000 (crop rainfall checks) | India Meteorological Department, "District wise rainfall normal", data.gov.in | Government Open Data Licence – India |
| Soil (pH, nitrogen, organic carbon, clay, sand, CEC) | ISRIC SoilGrids v2.0 | CC BY 4.0 |
| Climate (20-year averages: temperature, winter and hottest month, humidity, rain, monsoon and post-monsoon share, dry months, sunlight) | NASA POWER | Free, public |
| Height above sea level and steepness | Open-Meteo elevation API (Copernicus DEM 90 m) | CC BY 4.0 |
| Karnataka district boundaries (Census 2011) | civictech-India/INDIA-GEO-JSON-Datasets | No licence stated |
| Karnataka taluk boundaries (Census 2011 sub-districts) | datta07/INDIAN-SHAPEFILES | MIT |
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

**Optional AI (Groq, then Gemini).** The app's own rule-based answer comes first. Only when the checked
facts do not cover a question, or the question could not be read, does the backend's `/chat` route ask an AI:
Groq first (`GROQ_API_KEY`, model `openai/gpt-oss-120b`), and Gemini (`GEMINI_API_KEY`) only if Groq fails
(no key, limit reached, error, timeout, or a reply the checks throw away). The AI answers farming questions only
(any crop, soil, water, fertiliser, pests and diseases, harvest, storage); anything else is politely declined.
To stay small (about 1,600 tokens a question, inside Groq's free 8,000 tokens a minute), it gets short rules,
the list of crops, the full checked facts only of the crops in the question, the farm result, help contacts and
the app's own plain-English reading of the question ("ragi ge gobbara yavaga" becomes "ragi fertilizer when").
It marks each reply `facts` or `general`, and the backend checks every reply: a `facts` reply with a number
that is not in the facts is thrown away, a `general` reply with an amount (litres, mm, kg) that is not in the
facts is thrown away, any reply with a spray dose is thrown away, and a `general` reply is shown with a note
that it is general advice. Pests and diseases get the likely cause and safe first steps, never a brand or
dose; prices are never given (no AI knows today's price), the farmer is sent to the APMC market or the Kisan
Call Centre. If neither AI answers, the app quietly uses its rule-based answer.
