-- The crop a result showed the farmer as "Best crop to sow this season" (the headline on Home). It is often not the
-- model's top crop: when that one stands all year (coconut, arecanut...), Home shows the season's best crop to sow
-- and the year-round one under it. My crops history shows the same two, so a past result matches what the farmer saw.
-- Results saved before this are NULL: history then shows their top crops as before. Safe to run twice.
-- (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/016_best_to_sow.sql

BEGIN;

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS best_to_sow  TEXT;

COMMIT;
