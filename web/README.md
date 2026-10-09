# GreenRoot website

The browser version of GreenRoot: the same features, backend and English and Kannada texts as the phone app,
laid out as a website (a top bar with the pages, wide two-column pages, a footer).
It is React + TypeScript, built with Vite. It never changes anything in `frontend/` (the phone app).

## Run it

Start the ML service and the backend first (see the main README, step 5), then:

```
npm install      # first time only
npm run dev      # http://localhost:5173
npm run build    # makes dist/; the backend then serves it too, at http://localhost:4000
npm run check    # type check only
```

## How it is built

```
src/
  main.tsx            starts the app; turns the phone app's colours into CSS variables
  App.tsx             the pages, and who may open which (logged out / logged in / admin)
  styles.css          all the styling, in one file
  pages/              one file per page
    Login, Register, Home, Chat, Profile, CropPage, Compare, History, Saved, About,
    Dashboard (admin), DashboardRecommendation (admin)
  components/         pieces of pages
    ui.tsx            Card, Button, Chip, TextField, bars: the small building blocks
    Layout.tsx        the site's top bar (pages, language, the farmer's menu), the footer, and the pages kept open
    CropPhoto.tsx     a crop photo (a seedling box while it loads or if it cannot load), a crop row with its photo
    LocationCard, WeatherCard, SoilTestForm, Results (+ ResultCards), WaterPlan, FeedbackForm, AdminLogin, AuthPage
  lib/
    api.ts            calls the backend: fetch("/api/...")
    app-context.tsx   who is logged in, the language, the last result, the crop list and the saved crops
    use-farm-location.ts   where the land is: browser position or a picked district
    detect-location.ts, types.ts, web-text.ts
```

The pages do what the phone app's screens do (`pages/Home.tsx` is `frontend/src/app/(tabs)/index.tsx`,
`components/Results.tsx` is `frontend/src/components/results.tsx`, ...), but are laid out for a wide screen:

- **Top bar:** the logo, the pages (Find crops, Crop helper, Compare, Saved crops, History), the language, and the
  farmer's menu (profile, about, log out). On a narrow screen the pages fold into "Menu" (a `<details>` element, no
  script library). There is no bar at the bottom: that is the phone app's way.
- **Home:** "Your land" on the left (place, season, water, soil test, Find crops), the weather and the answer on the
  right; the best crop shows its photo beside the details and the other crops are in two columns.
- **Crop page:** the photos on the left, the facts on the right. **Crop helper:** the crops in a side panel.
  **Profile:** the account on the left and the farmer's pages as tiles. **Saved crops** and **History:** card grids.
- **Login:** GreenRoot's introduction on the left half, the form on the right.
- Home, the crop helper and the profile stay open while the farmer moves between pages (`Layout.tsx` hides the
  ones not shown), so a result or a chat is not lost; the other pages show in its `<Outlet />`.
- Below 1000 px wide the columns stack, so the same pages work on a phone's browser.

**Reused from the phone app, read only.** `vite.config.ts` gives two short names to imports: `~/` is this folder's
`src`, and `@/` is `frontend/src`. The website imports only plain TypeScript from there: the English and Kannada texts
(`translations.ts`), crop facts (`crop-info.ts`), the chat rules (`chatbot.ts`, `farmer-words.ts`), the water formula
(`crop-water.ts`), the seasons (`season.ts`), the weather codes (`weather.ts`), the crop page and compare rows
(`crops.ts`), the past results (`past-results.ts`) and the colours (`theme.ts`). Nothing React Native is used. If one of those
files starts to import something React Native, `npm run check` fails here.
`chatbot.ts` imports two types from a phone screen; `tsconfig.json` points that import to `src/lib/types.ts`.

**Talking to the backend.** Every call goes to `/api/...` on the website's own address. In development the Vite server
passes it on to the backend (`API_TARGET`, default `http://localhost:4000`); when the backend serves the built site it
is the same server. The backend has the same routes at `/` (the phone) and at `/api` (the website).

**Login.** The backend puts the login token in an `httpOnly` cookie, so nothing in this code ever sees it. The page only
asks `GET /api/users/me` "who am I?". Every request carries `X-Client: web`; the backend answers a web login with a cookie
(not a token in the body) and only accepts changes that come from the website's own address. Only the language choice is
kept in the browser (`localStorage`).

**Content-Security-Policy.** The backend sends a strict one with the built site: scripts, styles and data only from its own
address. So the site uses CSS files (no inline `<style>`), no external fonts or CDNs, and no `dangerouslySetInnerHTML`.

## Differences from the phone app

- Location comes from the browser: it needs `localhost` or https, and a laptop has no GPS, so it is often rough
  (the page warns, as the phone does). The village name the phone adds is not available in a browser.
- District and taluk are drop-down lists instead of full-screen lists.
- The admin login is remembered only while the page stays open, like the phone app.
