-- "Delete" in the farmer's "My crops history" only hides a result from that farmer. The row stays, so the admin
-- dashboard, the feedback linked to it and future model training still have every result
-- (new installs get this from schema.sql). Hidden results count towards the 100 results kept per farmer: when
-- a new result would make it 101, the oldest one, hidden or not, is removed for good (see routes/recommend.js).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/009_hide_history.sql

BEGIN;

ALTER TABLE recommendations
    ADD COLUMN hidden_at  TIMESTAMPTZ;   -- when the farmer deleted it from their history (null: shown)

COMMIT;
