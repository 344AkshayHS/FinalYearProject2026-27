-- The season the crops were recommended for (model rf-india-2.0 takes the season as an input).
-- Run this on a database created before this version:
--   psql -U postgres -d greenroot -f backend/db/005_season.sql
-- Older rows keep NULL here: they were made by the yearly models (rf-india-1.x), which had no season.

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS season TEXT CHECK (season IN ('Kharif', 'Rabi', 'Summer'));
