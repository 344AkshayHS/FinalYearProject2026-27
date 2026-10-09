# GreenRoot – Short Description

**GreenRoot** is a crop recommendation system for farmers. It tells a farmer which crops suit their land in a
chosen season, and explains why. It is available as an **Android app** and as a **website**, in **English and
Kannada**.

Final-year B.E. project, CSE (AI & ML), Mangalore Institute of Technology & Engineering, 2026-27.

**Download the Android app (APK):**
https://expo.dev/artifacts/eas/qfcY2xYGiJprLkptQonLf3UrYXQBi8ugXJ7z32Gn714.apk

## The problem

Many farmers choose crops by habit or by what neighbours grow. They have no easy way to check whether their own
soil, rainfall and season suit a crop. The information exists (soil maps, climate records, government crop
statistics), but it is scattered and hard for a farmer to read.

## What GreenRoot does

1. The farmer shares their location by GPS, or picks their state, district and taluk.
2. The farmer chooses the season: Kharif, Rabi or Summer.
3. GreenRoot reads that place's soil and 20-year climate from online scientific sources.
4. A machine learning model ranks the crops that suit that land. It shows the best crop to sow, the other good
   crops and the reasons for each.

## Main features

- Crop recommendation for the exact place and season, with the reasons explained in simple words.
- What farmers around that place really grow (from the Agriculture Census).
- Whether rain alone is enough for a crop or it needs irrigation.
- A page for each crop: photos, growing time, water need, and the best soil and climate for it.
- Compare crops side by side, and save favourite crops.
- Weather now and for the next three days, with a rain warning.
- A crop helper chat that answers questions in English or Kannada.
- The farmer can enter their own soil test (Soil Health Card) values.
- A history of past results, a profile with photo, and a secure password change.
- A notification bell in the phone app: rain warnings, sowing-season reminders and "How are your crops?".
- Light and dark colour themes in the phone app.
- Big-text option and simple words, for older farmers with weak eyesight.
- Farmer feedback on how a crop did, used to improve the model.
- Admin pages that show how a recommendation was made and how accurate the model is.

## How it works (technology)

| Part | Technology |
|---|---|
| Android app | React Native (Expo) |
| Website | React + Vite |
| Server and database | Node.js, Express, PostgreSQL |
| Machine learning service | Python, FastAPI, scikit-learn |
| Model | Random Forest (chosen after comparing 7 models) |
| Explanations | SHAP and LIME (why the model chose each crop) |

**Data used:** government crop statistics for 568 districts of India and every taluk of Karnataka (Agriculture
Census, Karnataka DES, ICRISAT, data.gov.in), soil from ISRIC SoilGrids, climate from NASA POWER, rainfall from
IMD, crop needs from FAO EcoCrop, and weather from Open-Meteo. No data is made up. When a source has no figure,
the app says so instead of guessing.

**Accuracy:** the model is tested on districts it never saw during training. The crop really grown most in a
district is in GreenRoot's top 3 for **88% of districts in India** and **83% in Karnataka**.

## Who it helps

- **Farmers:** a clear, local, season-wise crop choice in their own language.
- **Agriculture officers and students:** a quick view of what suits a place, and why.

## How to use it

1. Install the APK on an Android phone (Android 7 or newer), or open the website in any browser (also on an iPhone).
2. Sign up with a mobile number and a password.
3. Allow location (or pick a district), choose the season and tap **Find crops**.

The server part (model and database) runs on the project PC, so it must be switched on while the app is used.
The full setup is in [README.md](README.md).
