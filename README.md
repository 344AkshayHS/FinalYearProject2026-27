# GreenRoot

GreenRoot tells a farmer which crops suit their land. The farmer shares their location (or picks their district)
and chooses the season. GreenRoot then reads the soil and the long-term climate of that place and recommends crops,
with the reasons. It works in English and Kannada, as an Android app and as a website.

Final-year B.E. (CSE – AI & ML) project, Mangalore Institute of Technology & Engineering.

| | |
|---|---|
| **Download the Android app (APK)** | https://expo.dev/artifacts/eas/kWQ5NnnTTgBO2udZOhNAz9er4teQiFdWCLh5Fm8VUM8.apk |
| **Short description of the project** | [SHORT-DESCRIPTION.md](SHORT-DESCRIPTION.md) |
| **How to install the app** | [Installing the Android app](#installing-the-android-app-apk) |

The app needs the GreenRoot server (the model and the database) to be running on the project PC while it is used
([Starting GreenRoot on the PC](#starting-greenroot-on-the-pc-one-double-click)).

**Contents:** [What it does](#what-a-farmer-can-do) · [Where it works](#where-it-works-devices-and-browsers) ·
[How it works](#how-it-works) · [Installing the Android app](#installing-the-android-app-apk) ·
[Starting GreenRoot on the PC](#starting-greenroot-on-the-pc-one-double-click) · [iPhone and iPad](#iphone-and-ipad) ·
[Setting it up from the code](#setting-it-up-from-the-code) · [Tests](#tests) · [Data sources](#where-the-data-comes-from)

## What a farmer can do

- **Find crops for their land.** GPS gives the exact spot. Without GPS, they pick a state, a district and, in
  Karnataka, a taluk. The answer is for the chosen season (Kharif, Rabi or Summer).
- **See why.** Each result shows the main reasons (SHAP), what farmers around them really grow (Agriculture
  Census), and whether rain alone is enough or the crop needs irrigation there.
- **Look at each crop.** A crop page has up to 5 photos (the harvested crop first), how long it takes, how much
  water it needs, and the best rain, temperature and soil pH for it.
- **Compare crops** side by side (up to 3), and **save** crops with the heart.
- **Check the weather** now and for the next three days, with a warning before rain.
- **Ask the crop helper chat** about water, growing time, sowing or today's weather, in English, Kannada, or
  Kannada typed in English letters. After each answer it suggests the next questions; "New chat" clears it.
- **Enter a soil test** (Soil Health Card) to use their own pH and organic carbon.
- **See past results** (My crops history) and **delete** any of them with the bin at the top right. A deleted
  result only disappears for the farmer: the project still keeps it (see "Where the data is kept" below).
- **Change the language** at any time, including numbers as 0-9 or ೦-೯.
- **Make the text bigger** (Profile → Text size: Normal, Big, Bigger), also on the sign-in page, for people who
  cannot read small letters. No text in either app is smaller than 15 px, and all texts use simple words.
- **Edit their profile:** name and a profile photo (camera or gallery). The mobile number is the login ID, so it is
  shown but cannot be changed. **Change password** is its own page: the old password, then the new one two times.
- **Tell us how a crop did.** This feedback is used to retrain the model, which is kept only if it does not get worse.

The project team signs in as **admin** from the sign-in page ("Admin login", folded at the bottom). The admin
pages show how one recommendation was made step by step and how well the model does, from real data only.

## Where it works (devices and browsers)

GreenRoot comes in two forms, with the same features and the same results:

- **The Android app** (an APK file you install).
- **The website**, which opens in any modern browser on a phone, tablet or computer.

| Device | How to use GreenRoot | Works on |
|---|---|---|
| Android phone (any brand: Samsung, Redmi, Vivo, Oppo, Realme, OnePlus, Motorola, ...) | Install the APK, or open the website in Chrome | Android 7.0 or newer (from 2016) |
| Android tablet | Same as a phone. The app stays upright (portrait); the website also turns sideways | Android 7.0 or newer |
| iPhone | Open the website in Safari (an APK cannot be installed on an iPhone, see [iPhone and iPad](#iphone-and-ipad)) | iOS 16.4 or newer (iPhone 8 and later) |
| iPad | Open the website in Safari | iPadOS 16.4 or newer (iPad 5th generation and later) |
| Windows, Mac or Linux laptop / desktop | Open the website | Any browser below |

**Browsers for the website.** All are versions from 2023 onwards. A browser that updates itself is always new enough.

| Browser | Lowest version |
|---|---|
| Google Chrome (computer and Android) | 111 |
| Microsoft Edge | 111 |
| Mozilla Firefox | 114 |
| Apple Safari (Mac, iPhone, iPad) | 16.4 |
| Samsung Internet, Opera, Brave and other Chrome-based browsers | Any up-to-date version |
| Internet Explorer | Not supported (Microsoft stopped it in 2022) |

**Screen sizes.**
- The website arranges itself for a phone, a tablet and a laptop. On a narrow screen the pages fold into a "Menu"
  button.
- It was tested at phone width (390 px) and laptop width (1366 px), with every page fitting the screen.

**Location (GPS)** works in the app, and in the website when it is opened over **https** (the internet address
below) or on the PC itself (`localhost`). Browsers block location on a plain `http://192.168...` address. There the
farmer picks the district instead.

**The PC that runs GreenRoot** (the model and the database) needs Windows 10 or 11 for the one-click starter. The
parts themselves (Node.js, Python, PostgreSQL) also run on Mac and Linux, started by hand
([Step 6](#setting-it-up-from-the-code)).

**Internet** is needed while GreenRoot is used: it reads soil, climate and weather from online services.

## How it works

```
Android app (Expo)  ─┐
                     ├──►  Backend (Node + Express + PostgreSQL)  ──►  ML service (Python + FastAPI)
Website (React)  ────┘     logins, places, history, saved crops,       soil (SoilGrids), climate (NASA POWER),
                           weather (Open-Meteo), crop photos            Random Forest model, SHAP and LIME
```

1. The app sends the place and the season to the backend.
2. The ML service reads that place's soil (ISRIC SoilGrids), 20-year climate (NASA POWER) and terrain.
3. A Random Forest model gives each crop a probability: roughly, how many acres in 10 of land like this grow it.
   It is trained on government crop statistics of districts across India, and of every taluk of Karnataka.
4. The backend adds what farmers really grow there and the season's rain. It saves the result and sends it back.
5. The app shows the best crop to sow, the other good crops, and the details behind them.

The model is checked on districts it never saw during training: the crop really grown most in a district is in
its top 3 for 88% of districts in India and 83% in Karnataka. How it was built and tested is in
[docs/model-and-data.md](docs/model-and-data.md).

**Where things run.** The phone app and the website hold only the screens. The model, the database and the logic
run on one PC. Phones reach that PC over the internet through a fixed https address (a free ngrok tunnel, below).
So friends can use the app on mobile data, from anywhere, while the PC is on.

### English and Kannada

There is no machine translator. Every sentence of the app is written in both languages in
`frontend/src/lib/translations.ts`. Each sentence has blanks for the parts that change: "{temp}°C, {kind}" becomes
"31°C, Clear sky" or "31°C, ಶುಭ್ರ ಆಕಾಶ". So the weather, results and chat answers, which change every day, still
come out in correct Kannada.

Crop, district and taluk names have Kannada tables of their own (taluk names from OpenStreetMap, checked by hand).
Tests fail if an English text has no Kannada text, or if an English word slips into a Kannada answer. So a new
text cannot be forgotten.

## Installing the Android app (APK)

An **APK** is Android's installer file, like an `.exe` on Windows. It holds the screens; the model and the database
stay on the PC (above).

**Download link** (the latest build, Android 7.0 or newer):
https://expo.dev/artifacts/eas/kWQ5NnnTTgBO2udZOhNAz9er4teQiFdWCLh5Fm8VUM8.apk

**On each phone** (yours or a friend's):
1. Open the APK download link above (or as sent on WhatsApp, e-mail, ...) in the phone's browser and download the file.
2. Tap the downloaded file. If Android asks, allow **"Install unknown apps"** for that browser or file manager
   (the phone opens this setting itself; it is under Settings → Apps). This is needed for any app that is not from the Play
   Store.
3. Tap **Install**, then **Open**. If Play Protect warns that it does not know the app, choose
   **"Install anyway"**. It warns about every app that is not from the Play Store.
4. Sign up with a phone number and a password, and allow location when asked.

The PC must be running GreenRoot ([next section](#starting-greenroot-on-the-pc-one-double-click)) while the app is
used. Otherwise the app says it cannot reach the server.

**Making the APK** (once, on the PC; it is built on Expo's servers for free):
1. Make a free account on [expo.dev](https://expo.dev), then run `cd frontend` and `npx eas-cli login`.
2. Tell the build the backend's address: the internet address from Step 7 below. It never changes, so the APK
   keeps working.
   ```
   npx eas-cli env:set --environment preview --name EXPO_PUBLIC_API_URL --value https://greenroot-abc.ngrok-free.app --visibility plaintext
   ```
3. Build:
   ```
   npx eas-cli build -p android --profile preview
   ```
   It takes about 15 minutes and ends with a link and a QR code for the `.apk` file. That link is what you share.
   Put the new link at the top of this README and in [SHORT-DESCRIPTION.md](SHORT-DESCRIPTION.md).

You need a new APK only when the phone app's own code changes. Changes to the website, the backend or the model
reach everyone without reinstalling.

## Starting GreenRoot on the PC (one double-click)

`Start GreenRoot.bat` in the project folder is GreenRoot's one-click starter for Windows. It works like an `.exe`:
double-click it and it opens, each in its own window:
- the ML service;
- the backend, which also serves the website;
- the internet tunnel, once that is set up.

It then shows the addresses to use and opens the website. Parts that are already running are left alone. Close the
windows to stop GreenRoot.

It needs the one-time setup below (Steps 1-5). After that, starting GreenRoot is only the double-click. Two more
things must be true:
- PostgreSQL is running. It starts with Windows when installed as a service, which is the default.
- The PC is awake and online.

The first time, Windows SmartScreen may say "Windows protected your PC" because the file is not signed. Click
**More info → Run anyway**.

It shows up to three addresses:

| Address | Who can use it |
|---|---|
| `http://localhost:4000` | The PC itself |
| `http://192.168.x.x:4000` | Devices on the same Wi-Fi as the PC (this address can change with the Wi-Fi) |
| `https://<your-name>.ngrok-free.app` | Any phone or computer with internet, anywhere. The app uses this one |

## iPhone and iPad

**Can the APK run on an iPhone?** No. An APK is an Android file. iPhones and iPads install apps only from Apple's
App Store, or from Apple's own test system, and Apple charges for that (below).

**What works today, for free: the website.**
1. Open the internet address (`https://<your-name>.ngrok-free.app`) in **Safari**. The first time, ngrok shows a
   notice page: tap **Visit Site**.
2. Optional: tap **Share → Add to Home Screen**. GreenRoot then gets an icon on the home screen, like an app.

It is the same GreenRoot: the same results, chat, photos, weather, Kannada and location (location works because the
address is https). It needs iOS / iPadOS 16.4 or newer.

**Other ways, and what they need:**

| Way | What it needs | Good for |
|---|---|---|
| **Expo Go** (free app on the App Store) | Set `EXPO_PUBLIC_API_URL` in `frontend/.env` to the internet address, run `npx expo start --tunnel` in `frontend`, then scan the QR code with the iPhone camera. The PC must keep this running, and Expo Go must support this project's Expo version (SDK 57) | Showing the app on an iPhone during development |
| **A real iPhone app** (installable, with an icon) | An Apple Developer account (US$ 99 per year). Add `"ios": { "bundleIdentifier": "com.sololvls.greenroot" }` to `frontend/app.json`, then run `npx eas-cli build -p ios --profile preview`. Each friend's iPhone must first be registered (`npx eas-cli device:create`), or use Apple TestFlight | Sharing an installable app with iPhone users |
| **App Store / Play Store** | A paid developer account and Apple's or Google's review | A public release (beyond this project) |

**Nothing in GreenRoot's code is Android-only.**
- The app is built with Expo / React Native, which makes both Android and iPhone apps from the same code.
- The location, secure-login storage and photos it uses all work on iPhones (iOS 16.4 or newer).
- The internet address is https, which iPhones require.

So the paid account is the only thing missing for an iPhone app. One honest note: GreenRoot has not been tried on an
iPhone yet. The browser tests ran in Microsoft Edge (Chrome's engine), so check the website once in Safari on an
iPhone before showing it.

## Folders

| Folder | What is inside |
|---|---|
| `frontend/` | The Android app (Expo, React Native). Screens in `src/app`, shared logic in `src/lib` |
| `web/` | The website (React + Vite). It reuses the app's texts and logic. See [web/README.md](web/README.md) |
| `backend/` | The server (Express). Routes in `src/routes`, database tables in `db/` |
| `ml-service/` | The model service (`app/`) and the scripts that build the data and train the model (`training/`) |
| `crop-images/` | 457 crop photos with free licences, and who took each one (`CREDITS.md`) |
| `docs/` | Longer notes: the model and data, the chat, security |
| `Start GreenRoot.bat` | The one-click starter for the PC (it runs `start-greenroot.ps1`) |

## Setting it up from the code

You need:
- [Node.js](https://nodejs.org) 22.18 or newer
- [Python 3.13](https://www.python.org)
- [PostgreSQL](https://www.postgresql.org/download/)
- Git

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
If you already have an older GreenRoot database, run only the newer files in `backend/db/` (`002_...` to `009_...`).

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
cd ..\web;      npm install; npm run build
cd ..
```

**5. Admin account** (for the admin pages; choose a strong password)
```
cd backend; npm run create-admin -- <username> <password>
```

**6. Start.** Double-click `Start GreenRoot.bat` and open http://localhost:4000. Or start the parts by hand, each in
its own terminal (this also works on Mac and Linux):
```
cd ml-service; .venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
cd backend;    npm run dev
cd web;        npm run dev          # the website while changing its code: http://localhost:5173
cd frontend;   npx expo start       # the phone app while changing its code: scan the QR code with Expo Go
```

**7. The internet address** (so any phone can reach the PC, on any network)

[ngrok](https://ngrok.com) is free. It gives the PC one fixed https address that does not change when the Wi-Fi or
the PC's own address changes.
1. Install it: `winget install ngrok.ngrok`, then `ngrok update`.
2. Sign up on ngrok.com and run the command it shows: `ngrok config add-authtoken <your token>`.
3. In the ngrok dashboard, open **Domains** and take your free domain, for example `greenroot-abc.ngrok-free.app`.
4. Add it to `backend/.env`: `PUBLIC_URL=https://greenroot-abc.ngrok-free.app`
5. Double-click `Start GreenRoot.bat`. On a phone using mobile data, open `https://greenroot-abc.ngrok-free.app/api/`.
   It should say "GreenRoot backend is running".

The address is public, so anyone who has it can see the sign-in page. Keep the admin password strong. How logins
are protected is in [docs/security.md](docs/security.md).

## Tests

Each part has its own tests. They need no internet, and only the ML tests need the trained model.
```
cd backend;    npm test                                         # logins, limits, chat safety checks, places, photos
cd frontend;   npm test                                         # chat answers, crop pages, seasons, water, texts
cd ml-service; .venv\Scripts\python -m unittest discover tests  # crop needs and the model's answers
```
The whole app was also tested in a real browser, at phone and laptop sizes, through the internet address.
The checks covered every page, both languages and all 457 photos.

## Where the data comes from

| What | Source |
|---|---|
| Crop statistics | Agriculture Census, Karnataka Directorate of Economics and Statistics, ICRISAT, data.gov.in |
| Soil | ISRIC SoilGrids |
| Climate | NASA POWER |
| Normal rainfall | India Meteorological Department |
| Crop needs | FAO EcoCrop |
| Water and growing time | TNAU Agritech Portal and FAO |
| Weather forecast | Open-Meteo |
| Photos | Wikimedia Commons, Flickr and iNaturalist |

The full list with licences is in [docs/model-and-data.md](docs/model-and-data.md#data-sources).

Every figure the app shows comes from one of these sources. Where a source has no figure, the app shows "—" or
says it does not know, instead of guessing.

## Where the data is kept (for the project team)

Everything is in the PostgreSQL database `greenroot` (open it with pgAdmin: Servers → PostgreSQL → Databases →
greenroot → Schemas → public → Tables; right-click a table → View/Edit Data → All Rows).

| What | Table | Notes |
|---|---|---|
| Accounts | `users` | name, mobile number, language, photo. Passwords only as a hash (`password_hash`): nobody can read them |
| Results (crop history) | `recommendations`, `recommendation_items` | `hidden_at` is set when the farmer deleted it from their history; the row stays |
| Feedback | `crop_feedback` | crop, how it went, note, date. `cd backend; npm run export-feedback` writes it to `ml-service/data/raw/farmer_feedback.csv` |
| Saved crops | `saved_crops` | |
| Admin login | `admins` | separate from farmer accounts |

**Deleting all farmer accounts** (for example the test accounts before a demo): in pgAdmin, right-click
`greenroot` → Query Tool, run `DELETE FROM users;` (F5). This also deletes those accounts' results, feedback and
saved crops, because they belong to the accounts. Run `npm run export-feedback` first if you want to keep the
feedback. The admin login (`admins` table) is not touched.

## More details

- [SHORT-DESCRIPTION.md](SHORT-DESCRIPTION.md): the project on one page (problem, features, technology, accuracy)
- [docs/model-and-data.md](docs/model-and-data.md): training steps, the dataset, seasons, how the model is checked
- [docs/chatbot.md](docs/chatbot.md): how the crop helper chat answers, and when it asks the AI
- [docs/security.md](docs/security.md): logins, limits, and the admin pages
- [web/README.md](web/README.md): how the website is built
