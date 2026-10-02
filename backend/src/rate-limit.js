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

module.exports = { lockedOut, wrongPassword, rightPassword, limitRequests, MAX_TRIES, LOCK_MINUTES };
