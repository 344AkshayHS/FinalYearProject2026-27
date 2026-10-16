-- Whether a result was made from the phone's GPS (true) or from a district/taluk picked by hand (false). The Profile
-- tab's "Last checked" place follows GPS results only. Results saved before this are NULL (not known), so they are
-- not used for it. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/013_from_gps.sql

BEGIN;

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS from_gps  BOOLEAN;

COMMIT;
