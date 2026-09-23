// Slows down password guessing: after a few wrong passwords from the same place,
// that name and address are locked out for a while.
//
// Kept in memory, so a restart clears it. That is fine for one server: an attacker
// cannot restart it, and real users are rarely locked out for more than a few minutes.

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

module.exports = { lockedOut, wrongPassword, rightPassword, MAX_TRIES, LOCK_MINUTES };
