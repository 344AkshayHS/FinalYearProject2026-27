const crypto = require('crypto');
const pool = require('./db');

// Passwords are stored as "salt:hash" using scrypt (built into Node, no extra package)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  const saved = Buffer.from(hash ?? '', 'hex');
  if (saved.length !== 64) {
    return false; // not a password written by hashPassword
  }
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), saved);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

// Reads "Authorization: Bearer <token>" and puts the logged-in user on req.user (or null)
async function readUser(req, res, next) {
  req.user = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    const result = await pool.query(
      `SELECT users.id, users.full_name, users.phone, users.preferred_language
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = $1`,
      [token]
    );
    req.user = result.rows[0] || null;
    req.token = token;
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

// --- Admin (ML dashboard) ---------------------------------------------------
// Admins log in with a username, separately from farmers. Their token is sent the same way
// ("Authorization: Bearer <token>") and is valid for 12 hours.

async function createAdminSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO admin_sessions (token, admin_id) VALUES ($1, $2)', [token, adminId]);
  return token;
}

// Use on routes only an admin may call
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const result = token
    ? await pool.query(
        `SELECT admins.id, admins.username
         FROM admin_sessions JOIN admins ON admins.id = admin_sessions.admin_id
         WHERE admin_sessions.token = $1 AND admin_sessions.created_at > now() - interval '12 hours'`,
        [token]
      )
    : { rows: [] };
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'admin_login_required' });
  }
  req.admin = result.rows[0];
  req.adminToken = token;
  next();
}

module.exports = {
  hashPassword,
  checkPassword,
  createSession,
  readUser,
  requireUser,
  createAdminSession,
  requireAdmin,
};
