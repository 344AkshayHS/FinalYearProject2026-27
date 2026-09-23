-- Six more model inputs (model rf-india-1.2): four from NASA POWER and two from the
-- Open-Meteo elevation map. Run this on a database created before this version:
--   psql -U postgres -d greenroot -f backend/db/004_terrain_and_climate.sql
-- Older rows keep NULL here: they were made by rf-india-1.1, which did not use these values.

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS post_monsoon_rain_share NUMERIC(4,3) CHECK (post_monsoon_rain_share BETWEEN 0 AND 1),
    ADD COLUMN IF NOT EXISTS dry_months              SMALLINT     CHECK (dry_months BETWEEN 0 AND 12),
    ADD COLUMN IF NOT EXISTS max_temperature_c       NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS solar_radiation         NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS elevation_m             NUMERIC(7,1),
    ADD COLUMN IF NOT EXISTS slope_degrees           NUMERIC(5,2);
