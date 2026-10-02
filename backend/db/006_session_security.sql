-- Safer logins (new installs get this from schema.sql).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/006_session_security.sql
--
-- Before: the database kept each login token as it was sent, and a farmer's login never ended.
-- Now:    it keeps only a SHA-256 hash of the token (so a leaked database cannot be used to log in),
--         and every session has an end date: 30 days for farmers, 12 hours for admins.
-- A plain token cannot be turned into its hash from here, so every session is deleted once:
-- everybody logs in again one time.

BEGIN;

DELETE FROM sessions;
ALTER TABLE sessions RENAME COLUMN token TO token_hash;
ALTER TABLE sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days';

DELETE FROM admin_sessions;
ALTER TABLE admin_sessions RENAME COLUMN token TO token_hash;
ALTER TABLE admin_sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '12 hours';

COMMIT;
