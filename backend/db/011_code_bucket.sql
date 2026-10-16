-- SMS codes are now limited with a token bucket per number (src/phone-codes.js): 3 codes at once, then one more
-- every 30 seconds, but only 5 times (8 codes in all). 24 hours after the first code the number starts again.
-- The old count ("sends") is replaced. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/011_code_bucket.sql

BEGIN;

ALTER TABLE phone_codes
    ADD COLUMN IF NOT EXISTS tokens       SMALLINT    NOT NULL DEFAULT 3,      -- codes that may be sent right now
    ADD COLUMN IF NOT EXISTS refills      SMALLINT    NOT NULL DEFAULT 0,      -- codes added back since first_sent_at
    ADD COLUMN IF NOT EXISTS refilled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- the next code is added 30 s after this
    DROP COLUMN IF EXISTS sends;

COMMIT;
