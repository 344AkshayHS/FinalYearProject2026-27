const crypto = require('crypto');
const { promisify } = require('util');
const pool = require('./db');

const scrypt = promisify(crypto.scrypt);

// How long a login lasts
const SESSION_DAYS = 30;
const ADMIN_HOURS = 12;

// The phone app sends its token as "Authorization: Bearer <token>" and keeps it in SecureStore.
// The website gets the same kind of token in an httpOnly cookie instead: JavaScript on the page can never
// read it, so a bug in the page cannot leak it. The cookie is only used when there is no Bearer header.
const USER_COOKIE = { name: 'gr_session', path: '/', seconds: SESSION_DAYS * 24 * 3600 };
const ADMIN_COOKIE = { name: 'gr_admin', path: '/api/admin', seconds: ADMIN_HOURS * 3600 };

// --- Passwords --------------------------------------------------------------

// Passwords are stored as "salt:hash" using scrypt (built into Node, no extra package).
// The async version is used so a login does not freeze the whole server while scrypt runs.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return `${salt}:${hash}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  const saved = Buffer.from(hash ?? '', 'hex');
  if (saved.length !== 64) {
    return false; // not a password written by hashPassword
  }
  return crypto.timingSafeEqual(await scrypt(password, salt, 64), saved);
}

// A hash of a password nobody has, checked when the account does not exist
const NO_SUCH_ACCOUNT = `${'00'.repeat(16)}:${crypto.scryptSync('nobody', '00'.repeat(16), 64).toString('hex')}`;

// Use this for logins. It always runs scrypt once, also when there is no such account, so a wrong
// phone number takes as long to answer as a wrong password: nobody can find out who has an account.
async function checkLogin(password, storedHash) {
  const passwordFits = await checkPassword(password, storedHash ?? NO_SUCH_ACCOUNT);
  return storedHash != null && passwordFits;
}

// --- Tokens -----------------------------------------------------------------

// The database keeps only this hash of a token. A random 32-byte token needs no slow hash.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS]
  );
  return token;
}

async function createAdminSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [hashToken(token), adminId, ADMIN_HOURS]
  );
  return token;
}

// Finished sessions are useless, so they are deleted (at start-up and every hour)
async function deleteOldSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query('DELETE FROM admin_sessions WHERE expires_at < now()');
}

// --- Cookies (website) ------------------------------------------------------

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return value.join('=');
    }
  }
  return null;
}

// Where is the login token? -> { token, viaCookie }
function findToken(req, cookie) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return { token: header.slice(7), viaCookie: false };
  }
  const fromCookie = readCookie(req, cookie.name);
  return fromCookie ? { token: fromCookie, viaCookie: true } : { token: null, viaCookie: false };
}

function isWebClient(req) {
  return req.headers['x-client'] === 'web';
}

// Answer to a login or register. The phone gets { token, ...body }. The website gets only the body
// and the token in an httpOnly cookie (SameSite=Strict: other sites cannot make the browser send it).
// Set COOKIE_SECURE=true when the site runs on https, so the cookie is never sent over plain http.
function sendSession(req, res, cookie, token, body, status = 200) {
  if (!isWebClient(req)) {
    return res.status(status).json({ token, ...body });
  }
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  res.append('Set-Cookie', `${cookie.name}=${token}; HttpOnly; SameSite=Strict; Path=${cookie.path}; Max-Age=${cookie.seconds}${secure}`);
  res.status(status).json(body);
}

function clearSessionCookie(res, cookie) {
  res.append('Set-Cookie', `${cookie.name}=; HttpOnly; SameSite=Strict; Path=${cookie.path}; Max-Age=0`);
}

// --- Cross-site request forgery ----------------------------------------------
// A browser sends cookies by itself, even when another website makes it send the request. So a request
// that uses a cookie and changes something must come from our own web page: the browser fills in
// "Origin" (a page cannot fake it) and our page adds "X-Client: web" (another site cannot add it
// without our permission). Requests with a Bearer token (the phone) use no cookie and need neither.
// WEB_ORIGIN lists the addresses the website is opened at (comma separated). Without it: this PC's own
// addresses, and PUBLIC_URL, the fixed internet address of the tunnel (see start-greenroot.ps1).
function webOrigins() {
  if (process.env.WEB_ORIGIN) {
    return process.env.WEB_ORIGIN.split(',').map((origin) => origin.trim());
  }
  const port = process.env.PORT || 4000;
  const local = ['localhost', '127.0.0.1'].flatMap((host) => [`http://${host}:5173`, `http://${host}:${port}`]);
  if (!process.env.PUBLIC_URL) {
    return local;
  }
  // "greenroot-abc.ngrok-free.app" written without https:// still means the https address
  const publicUrl = process.env.PUBLIC_URL.trim().replace(/\/+$/, '');
  return [...local, /^https?:\/\//.test(publicUrl) ? publicUrl : `https://${publicUrl}`];
}

function stopForgedRequests(req, res, next) {
  const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const usesCookie =
    !(req.headers.authorization || '').startsWith('Bearer ') &&
    Boolean(readCookie(req, USER_COOKIE.name) || readCookie(req, ADMIN_COOKIE.name));
  if (changesData && (usesCookie || isWebClient(req)) && !(isWebClient(req) && webOrigins().includes(req.headers.origin))) {
    return res.status(403).json({ error: 'csrf_blocked' });
  }
  next();
}

// --- Who is logged in ---------------------------------------------------------

// Puts the logged-in user on req.user (or null)
async function readUser(req, res, next) {
  req.user = null;
  const { token, viaCookie } = findToken(req, USER_COOKIE);

  if (token) {
    const result = await pool.query(
      `SELECT users.id, users.full_name, users.phone, users.preferred_language, users.created_at, users.photo_updated_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
      [hashToken(token)]
    );
    req.user = result.rows[0] || null;
    req.token = token;
    req.tokenViaCookie = viaCookie;
  }
  next();
}

// Use on routes that need a logged-in user
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'login_required' });
  }
  next();
}

// Use on routes only an admin may call. Admins log in with a username, separately from farmers.
async function requireAdmin(req, res, next) {
  const { token, viaCookie } = findToken(req, ADMIN_COOKIE);
  const result = token
    ? await pool.query(
        `SELECT admins.id, admins.username
         FROM admin_sessions JOIN admins ON admins.id = admin_sessions.admin_id
         WHERE admin_sessions.token_hash = $1 AND admin_sessions.expires_at > now()`,
        [hashToken(token)]
      )
    : { rows: [] };
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'admin_login_required' });
  }
  req.admin = result.rows[0];
  req.adminToken = token;
  req.adminTokenViaCookie = viaCookie;
  next();
}

module.exports = {
  USER_COOKIE,
  ADMIN_COOKIE,
  hashPassword,
  checkLogin,
  hashToken,
  createSession,
  createAdminSession,
  deleteOldSessions,
  readCookie,
  sendSession,
  clearSessionCookie,
  webOrigins,
  stopForgedRequests,
  readUser,
  requireUser,
  requireAdmin,
};
