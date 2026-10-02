// Creates an admin account for the ML dashboard, or changes its password if it already exists.
// Only the scrypt hash of the password is saved.
//
// Run from the backend folder:  npm run create-admin -- <username> <password>

const pool = require('../src/db');
const { hashPassword } = require('../src/auth');

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 8) {
    console.log('Usage: npm run create-admin -- <username> <password>   (password: at least 8 characters)');
    process.exit(1);
  }
  await pool.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username.trim(), await hashPassword(password)]
  );
  await pool.query('DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE username = $1)', [
    username.trim(),
  ]);
  console.log(`Admin "${username.trim()}" is ready.`);
  await pool.end();
}

main();
