-- Update for an existing GreenRoot database (new installs get this from schema.sql).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/003_admin.sql
-- Then create the admin account:  npm run create-admin -- <username> <password>

BEGIN;

-- admins: people who can open the ML dashboard. Separate from farmer accounts.
CREATE TABLE IF NOT EXISTS admins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,          -- scrypt: "salt:hash"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- admin_sessions: an admin login lasts 12 hours (checked in src/auth.js)
CREATE TABLE IF NOT EXISTS admin_sessions (
    token       TEXT        PRIMARY KEY,
    admin_id    BIGINT      NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
