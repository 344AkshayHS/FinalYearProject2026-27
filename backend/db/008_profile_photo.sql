-- Profile photo: a small square JPEG the farmer picks on "Edit profile" (new installs get this from schema.sql).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/008_profile_photo.sql

BEGIN;

ALTER TABLE users
    ADD COLUMN photo             BYTEA,         -- the JPEG itself (the app sends it shrunk to about 30 KB)
    ADD COLUMN photo_updated_at  TIMESTAMPTZ;   -- when it was last changed (null: no photo)

COMMIT;
