// Slows down guessing and abuse. Everything is kept in memory, so a restart clears it. That is fine for
// one server: an attacker cannot restart it, and real users are rarely blocked for more than a few minutes.

// --- Wrong passwords ----------------------------------------------------------
// After a few wrong passwords for the same name from the same place, that name and address are
// locked out for a while.

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

const tries = new Map(); // "name from address" -> { count, firstTry }

function key(req, name) {
  return `${name.toLowerCase().trim()} from ${req.ip}`;
}

function minutesSince(time) {
  return (Date.now() - time) / 60000;
}

// Is this name and address locked out right now?
function lockedOut(req, name) {
  const attempt = tries.get(key(req, name));
  if (!attempt) {
    return false;
  }
  if (minutesSince(attempt.firstTry) > LOCK_MINUTES) {
    tries.delete(key(req, name));
    return false;
  }
  return attempt.count >= MAX_TRIES;
}

function wrongPassword(req, name) {
  const attempt = tries.get(key(req, name));
  if (!attempt || minutesSince(attempt.firstTry) > LOCK_MINUTES) {
    tries.set(key(req, name), { count: 1, firstTry: Date.now() });
    return;
  }
  attempt.count += 1;
}

function rightPassword(req, name) {
  tries.delete(key(req, name));
}

// --- How many requests are allowed --------------------------------------------
// Each limit can be changed in backend/.env without touching the code (for example LIMIT_RECOMMENDATIONS_PER_HOUR=200
// for a day of testing), and restarting the backend sets every count back to 0. These are the defaults: a farmer,
// or a team testing the app together, never reaches them; a script hammering the server does.

function fromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const LIMITS = {
  apiPerMinute: fromEnv('LIMIT_API_PER_MINUTE', 600), // per address; the website's files and photos do not count
  loginsPer15Minutes: fromEnv('LIMIT_LOGINS_PER_15_MINUTES', 50), // logins and sign-ups per address (one Wi-Fi)
  recommendationsPerHour: fromEnv('LIMIT_RECOMMENDATIONS_PER_HOUR', 100), // per farmer; a season change is one too
  chatPerHour: fromEnv('LIMIT_CHAT_PER_HOUR', 100), // per farmer
  weatherPerHour: fromEnv('LIMIT_WEATHER_PER_HOUR', 200), // per farmer
  districtLookupsPerMinute: fromEnv('LIMIT_DISTRICT_LOOKUPS_PER_MINUTE', 60), // per address (it may ask OpenStreetMap)
};

// --- Too many requests --------------------------------------------------------
// The lock above is per name, so someone could try a new name every time. This limits how many requests one
// address (or one user) may send in a period, for logins and for the routes that cost something
// (a recommendation asks three outside services; the chat asks an AI).

// Use as:  limitRequests(30, 60)  -> at most 30 requests an hour per address.
//          limitRequests(30, 60, (req) => req.user.id)  -> per logged-in user instead.
function limitRequests(max, minutes, whoIs = (req) => req.ip) {
  const counts = new Map(); // who -> { count, start }

  // Forget people whose period is over, so the list cannot grow forever
  setInterval(() => {
    for (const [who, entry] of counts) {
      if (minutesSince(entry.start) > minutes) {
        counts.delete(who);
      }
    }
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    const who = String(whoIs(req));
    let entry = counts.get(who);
    if (!entry || minutesSince(entry.start) > minutes) {
      entry = { count: 0, start: Date.now() };
      counts.set(who, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((minutes * 60000 - (Date.now() - entry.start)) / 1000)));
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}

module.exports = { lockedOut, wrongPassword, rightPassword, limitRequests, LIMITS, MAX_TRIES, LOCK_MINUTES };
