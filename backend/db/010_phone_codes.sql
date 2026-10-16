-- One-time codes sent by SMS (src/phone-codes.js): a new account needs one, and so does "Forgot password", so only
-- the owner of a mobile number can use it. One row per number and purpose; a new code replaces the old one.
-- Only the code's hash is kept. The row stays an hour after the last SMS, to count how many codes the number got.
-- (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/010_phone_codes.sql

BEGIN;

CREATE TABLE phone_codes (
    phone           TEXT        NOT NULL,
    purpose         TEXT        NOT NULL CHECK (purpose IN ('register', 'reset')),
    code_hash       TEXT        NOT NULL,
    tries           SMALLINT    NOT NULL DEFAULT 0,        -- codes typed in for it; 5 and it stops working
    expires_at      TIMESTAMPTZ NOT NULL,                  -- set to now() once the code has been used
    sends           SMALLINT    NOT NULL DEFAULT 1,        -- SMS sent since first_sent_at
    first_sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (phone, purpose)
);

COMMIT;
