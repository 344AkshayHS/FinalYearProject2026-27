# Security

Both apps talk to the same backend, so most of it is done there (`backend/src/auth.js`, `rate-limit.js`, `server.js`):
- **Logins.** Passwords are stored as scrypt hashes (at least 8 characters). A login token is stored only as a SHA-256
  hash, so a copy of the database cannot be used to log in. Farmer logins end after 30 days, admin logins after 12 hours.
  A wrong phone number takes as long to answer as a wrong password, so nobody can find out who has an account.
- **Phone app:** the token is in SecureStore (the phone's keystore), and the app logs out by itself when the server says
  the login has ended. It refuses plain `http://` to a public address (only localhost and your own Wi-Fi are allowed).
- **Website:** the token is in an `httpOnly` cookie (`SameSite=Strict`, `Secure` on https), so JavaScript on the page
  can never read it. A change made with that cookie must come from our own address (`Origin` check plus the
  `X-Client: web` header), so another website cannot make the browser send one for the farmer.
- **Limits.** 5 wrong passwords lock a phone number for 15 minutes. Per Wi-Fi address: 50 logins or sign-ups per 15
  minutes and 600 API requests a minute (the website's files and the crop photos do not count). Per farmer: 100
  recommendations, 100 chat questions and 200 weather requests an hour. These are high enough for a team testing the
  app together; each can be changed in `backend/.env` (`LIMIT_...`, see `.env.example`), and restarting the backend
  sets every count back to 0. `/recommend` needs a login.
- **Headers** (`nosniff`, no framing, no referrer, a strict Content-Security-Policy for the website), request size limit.
- **Known limit:** the chat takes the crop facts from the app (`frontend/src/lib/crop-info.ts`), so a logged-in user can
  only change their own answers; the server still refuses figures not in those facts and any chemical dose.
- **Settings for a real server:** `COOKIE_SECURE=true` (https), `WEB_ORIGIN` (the website's address), `TRUST_PROXY=1`
  (behind nginx or a host's load balancer). See `backend/.env.example`. Keep keys and passwords in `.env` files only.
- Tests: `cd backend; npm test` (logins, cookies, limits, the chat's reply checks).
- **Installed app (APK):** Android blocks plain http in an installed app, so `frontend/plugins/allow-local-http.js` allows it.
  The app itself still refuses plain http to anything but the PC and private Wi-Fi addresses (`src/lib/api.ts`).

## ML dashboard (admin)

**Admin login** is at the bottom of the login screen (folded, for the project team; no farmer account is needed)
and opens the ML dashboard. Admin sessions last 12 hours and are kept only in memory in the app; "Log out" ends them.

What keeps it safe is the server, not where the button is: every `/admin/...` address except the login itself checks
for a valid admin session (`requireAdmin` in `backend/src/auth.js`) and answers 401 without one. The admin password is
kept only as a scrypt hash, 5 wrong passwords lock the name for 15 minutes, and the dashboard never shows the API
keys (only whether they are set), passwords, phone numbers, names or which farmer asked. It does show each result's
place (district and the GPS point), so keep the admin password strong and private.
It shows, from real data only: how a recommendation is made step by step, live status of the database, ML service
and Gemini key, the training data, the 7-model comparison, feature importance, SHAP–LIME agreement, the conformal
set, calibration, the first experiment on the original CSV, feedback retraining runs, and app activity.
Tapping a recent recommendation shows every stored step: location, soil, climate, top 5 crops, SHAP and LIME.
Data comes from `GET /admin/overview` (backend) and `GET /report` (ML service, `app/report.py`).
