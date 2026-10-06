# GreenRoot

GreenRoot suggests which crops suit a farmer's land. The farmer shares their location (or picks their district),
chooses the season, and the app reads the soil and the long-term climate of that place and recommends crops,
with the reasons. It works in English and Kannada, as a phone app and as a website.

Final-year B.E. (CSE – AI & ML) project, Mangalore Institute of Technology & Engineering.

## What a farmer can do

- **Find crops for their land.** GPS gives the exact spot. Without GPS, they pick a state, a district and, in
  Karnataka, a taluk. The answer is for the chosen season (Kharif, Rabi or Summer).
- **See why.** Each result shows the main reasons (SHAP), what farmers around them really grow (Agriculture
  Census), and whether rain alone is enough or the crop needs irrigation there.
- **Look at each crop.** A crop page has up to 5 photos (the harvested crop first), how long it takes, how much
  water it needs, and the best rain, temperature and soil pH for it.
- **Compare crops** side by side (up to 3), and **save** crops with the heart.
- **Check the weather** now and for the next three days, with a warning before rain.
- **Ask the crop helper chat** about water, growing time, sowing, or today's weather, in English, Kannada or
  Kannada typed in English letters. After each answer it offers the next questions to tap.
- **Enter a soil test** (Soil Health Card) to use their own pH and organic carbon.
- **Tell us how a crop did.** This feedback is used to retrain the model, which is kept only if it does not get worse.

## How it works

```
Phone app (Expo)  ─┐
                   ├──►  Backend (Node + Express + PostgreSQL)  ──►  ML service (Python + FastAPI)
Website (React)  ──┘     logins, places, history, saved crops,       soil (SoilGrids), climate (NASA POWER),
                         weather (Open-Meteo), crop photos            Random Forest model, SHAP and LIME
```

1. The app sends the place and the season to the backend.
2. The ML service reads that place's soil (ISRIC SoilGrids), 20-year climate (NASA POWER) and terrain.
3. A Random Forest model, trained on government crop statistics of districts across India (and of every taluk of
   Karnataka), gives each crop a probability: about how many acres in 10 of land like this grow it.
4. The backend adds what farmers really grow there and the season's rain, saves the result and sends it back.
5. The app shows the best crop to sow, the other good crops, and the details behind them.

The model is checked on districts it never saw during training. How it was built and tested is in
[docs/model-and-data.md](docs/model-and-data.md).

## English and Kannada

There is no machine translator. Every sentence of the app is written in both languages in
`frontend/src/lib/translations.ts`, with blanks for what changes: "{temp}°C, {kind}" becomes "31°C, Clear sky" or
"31°C, ಶುಭ್ರ ಆಕಾಶ". So the weather, results and chat answers that change every day still come out in correct Kannada.
Crop, district and taluk names have Kannada tables of their own (taluks from OpenStreetMap, checked by hand). In
Kannada the farmer can choose numbers as 0-9 or as ೦-೯ (Profile → Language). Tests fail if an English text has no
Kannada text, or if an English word slips into a Kannada answer, so a new text cannot be forgotten.

## Folders

| Folder | What is inside |
|---|---|
| `frontend/` | The phone app (Expo, React Native). Screens in `src/app`, shared logic in `src/lib` |
| `web/` | The website (React + Vite). It reuses the phone app's texts and logic. See [web/README.md](web/README.md) |
| `backend/` | The API (Express). Routes in `src/routes`, database tables in `db/` |
| `ml-service/` | The model service (`app/`) and the scripts that build the data and train the model (`training/`) |
| `crop-images/` | 457 crop photos with free licences, and who took each one (`CREDITS.md`) |
| `docs/` | Longer notes: the model and data, the chat, security |

## Running it

You need [Node.js](https://nodejs.org) 22.18 or newer, [Python 3.13](https://www.python.org),
[PostgreSQL](https://www.postgresql.org/download/) and Git. For the phone, install **Expo Go** from the Play Store.
The commands are for Windows PowerShell, run from the project folder.

**1. Get the code**
```
git clone https://github.com/344AkshayHS/FinalYearProject2026-27.git
cd FinalYearProject2026-27
```

**2. Create the database** (5432 is PostgreSQL's usual port; use yours)
```
psql -U postgres -p 5432 -c "CREATE DATABASE greenroot"
psql -U postgres -p 5432 -d greenroot -f backend/db/schema.sql
```
If you already have an older GreenRoot database, run only the newer files in `backend/db/` (`002_...` to `007_...`).

**3. Settings.** Passwords and keys are kept in `.env` files, which are not on GitHub. Copy each `.env.example`
to `.env`:
- `backend/.env`: your PostgreSQL password and port. Optional: `GROQ_API_KEY` and `GEMINI_API_KEY` for the chat's AI.
- `ml-service/.env`, `web/.env`, `frontend/.env`: can stay as they are.

**4. Install** (first time only)
```
cd ml-service
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python training/train_location_model.py     # makes the model file once (about 1 h 40 min)
cd ..\backend;  npm install
cd ..\frontend; npm install
cd ..\web;      npm install
cd ..
```

**5. Start** the three parts, each in its own terminal:
```
cd ml-service; .venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000
cd backend;    npm run dev
cd frontend;   npx expo start
```
Scan the QR code with Expo Go. The phone must be on the same Wi-Fi as the PC (college Wi-Fi often blocks this;
a phone hotspot works). For the website: `cd web; npm run dev` and open http://localhost:5173.

## Installing the app on a phone (APK)

The APK is the app's installer for Android (7.0 or newer, any brand). It is only the screens: the model and the
database stay on your PC, so the phone must be on the same Wi-Fi (or hotspot) as the PC while it is used.

1. Make a free account on [expo.dev](https://expo.dev), then: `cd frontend` and `npx eas-cli login`.
2. Find the PC's address: `ipconfig`, the "IPv4 Address" of the Wi-Fi adapter, for example `192.168.1.10`.
3. Tell the build where the backend is (run it again with a new address to change it):
   ```
   npx eas-cli env:set --environment preview --name EXPO_PUBLIC_API_URL --value http://192.168.1.10:4000 --visibility plaintext
   ```
4. Build: `npx eas-cli build -p android --profile preview`. It runs on Expo's servers (about 15 minutes) and ends
   with a link and a QR code for the `.apk` file.
5. Open the link on the phone, download the APK, allow "Install unknown apps" for the browser, and install it.
6. On the PC start the ML service and the backend (step 5 above; Expo is not needed). If Windows asks, allow
   Node.js on private networks. To check, open `http://192.168.1.10:4000/api/` in the phone's browser: it should say
   "GreenRoot backend is running". Then open the app.

If the PC gets a new address (another Wi-Fi), update it in step 3 and build again. A phone hotspot or a fixed
address on the router keeps it the same. An iPhone cannot install an APK; it needs Expo Go, or a paid Apple
developer account for an installable build.

## Tests

Each part has its own tests. They need no internet, and only the ML tests need the trained model.
```
cd backend;    npm test                                       # logins, limits, chat safety checks, places, photos
cd frontend;   npm test                                       # chat answers, crop pages, seasons, water, texts
cd ml-service; .venv\Scripts\python -m unittest discover tests  # crop needs and the model's answers
```

## Where the data comes from

Crop statistics: Agriculture Census, Karnataka Directorate of Economics and Statistics, ICRISAT and data.gov.in.
Soil: ISRIC SoilGrids. Climate: NASA POWER. Normal rainfall: India Meteorological Department. Crop needs: FAO
EcoCrop. Water and growing time: TNAU Agritech Portal and FAO. Weather forecast: Open-Meteo. Photos: Wikimedia
Commons, Flickr and iNaturalist. The full list with licences is in [docs/model-and-data.md](docs/model-and-data.md#data-sources).

Every figure the app shows comes from one of these sources. Where a source has no figure, the app shows "—" or
says it does not know, instead of guessing.

## More details

- [docs/model-and-data.md](docs/model-and-data.md): training steps, the dataset, seasons, how the model is checked
- [docs/chatbot.md](docs/chatbot.md): how the crop helper chat answers, and when it asks the AI
- [docs/security.md](docs/security.md): logins, limits, and the admin dashboard
- [web/README.md](web/README.md): how the website is built
