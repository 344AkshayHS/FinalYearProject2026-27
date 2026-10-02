# GreenRoot website

The browser version of the GreenRoot phone app: same pages, same backend, English and Kannada.
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
    Login, Register, Home, Profile, Dashboard (admin), DashboardRecommendation (admin)
  components/         pieces of pages
    ui.tsx            Card, Button, Chip, TextField, bars: the small building blocks
    LocationCard, SoilTestForm, Results (+ ResultCards), WaterPlan, FeedbackForm, Chat, AdminLogin, Layout, AuthPage
  lib/
    api.ts            calls the backend: fetch("/api/...")
    app-context.tsx   who is logged in, the language, the last result
    use-farm-location.ts   where the land is: browser position or a picked district
    detect-location.ts, types.ts, web-text.ts
```

The pages follow the phone app's screens one for one (`pages/Home.tsx` is `frontend/src/app/index.tsx`,
`components/Results.tsx` is `frontend/src/components/results.tsx`, ...), so reading one next to the other is the
easiest way to understand either.

**Reused from the phone app, read only.** `vite.config.ts` gives two short names to imports: `~/` is this folder's
`src`, and `@/` is `frontend/src`. The website imports only plain TypeScript from there: the English and Kannada texts
(`translations.ts`), crop facts (`crop-info.ts`), the chat rules (`chatbot.ts`, `farmer-words.ts`), the water formula
(`crop-water.ts`), the seasons (`season.ts`) and the colours (`theme.ts`). Nothing React Native is used. If one of those
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
- The chat opens as a box at the bottom left instead of a screen (and the button is not draggable).
- The admin login is remembered only while the page stays open, like the phone app.
