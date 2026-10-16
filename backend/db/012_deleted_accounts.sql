-- "Delete account permanently" in the app (POST /users/me/delete): the account and everything linked to it are
-- deleted (crop history, saved crops, feedback, profile photo, logins). Only a copy of the login details is kept
-- here: the mobile number, the name and the password's hash (the password itself is never stored anywhere).
-- The number may make a new account later. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/012_deleted_accounts.sql

BEGIN;

CREATE TABLE IF NOT EXISTS deleted_accounts (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT      NOT NULL,              -- the id the account had in users
    full_name           TEXT        NOT NULL,
    phone               TEXT        NOT NULL,
    password_hash       TEXT        NOT NULL,              -- scrypt "salt:hash", as it was in users
    account_created_at  TIMESTAMPTZ NOT NULL,
    deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_accounts_phone_idx ON deleted_accounts (phone);

COMMIT;
