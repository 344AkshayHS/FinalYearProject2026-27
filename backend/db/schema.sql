-- GreenRoot PostgreSQL schema
-- Target: PostgreSQL 13+ (tested against 18). No extensions required.
-- Apply with:  psql -U postgres -d greenroot -f backend/db/schema.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name           TEXT        NOT NULL,
    phone               TEXT        NOT NULL UNIQUE,          -- farmers log in with phone number
    password_hash       TEXT        NOT NULL,                 -- scrypt: "salt:hash"
    preferred_language  TEXT        NOT NULL DEFAULT 'en'
                        CHECK (preferred_language IN ('en', 'kn')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions: one row per logged-in device. The app sends the token with each request.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
    token       TEXT        PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- admins: people who can open the ML dashboard. Separate from farmer accounts.
-- Create one with:  npm run create-admin -- <username> <password>
-- ---------------------------------------------------------------------------
CREATE TABLE admins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,          -- scrypt: "salt:hash"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- admin_sessions: an admin login lasts 12 hours (checked in src/auth.js)
CREATE TABLE admin_sessions (
    token       TEXT        PRIMARY KEY,
    admin_id    BIGINT      NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- soil_profiles: saved SoilGrids readings (0-30 cm topsoil) for GPS points,
-- so the same place is not downloaded twice.
-- ---------------------------------------------------------------------------
CREATE TABLE soil_profiles (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    latitude        NUMERIC(9,6)  NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude       NUMERIC(9,6)  NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    ph              NUMERIC(4,2)  NOT NULL CHECK (ph BETWEEN 0 AND 14),
    nitrogen        NUMERIC(6,2)  NOT NULL CHECK (nitrogen >= 0),        -- g/kg
    organic_carbon  NUMERIC(6,2)  NOT NULL CHECK (organic_carbon >= 0),  -- g/kg
    clay            NUMERIC(5,2)  NOT NULL CHECK (clay BETWEEN 0 AND 100),   -- %
    sand            NUMERIC(5,2)  NOT NULL CHECK (sand BETWEEN 0 AND 100),   -- %
    cec             NUMERIC(6,2)  NOT NULL CHECK (cec >= 0),             -- cmol(c)/kg
    source          TEXT          NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX soil_profiles_lat_lon_idx ON soil_profiles (latitude, longitude);

-- ---------------------------------------------------------------------------
-- locations: a point a user asked about. user_id is nullable so the
-- recommendation flow works before login.
-- ---------------------------------------------------------------------------
CREATE TABLE locations (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT        REFERENCES users (id) ON DELETE CASCADE,
    label       TEXT,                         -- e.g. "North field"
    latitude    NUMERIC(9,6)  NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude   NUMERIC(9,6)  NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    state       TEXT,
    district    TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX locations_user_idx ON locations (user_id);

-- ---------------------------------------------------------------------------
-- recommendations: one row per /recommend call. Stores the exact 11-feature
-- vector sent to the model so every result is reproducible and auditable.
-- ---------------------------------------------------------------------------
CREATE TABLE recommendations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    location_id         BIGINT        NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
    soil_profile_id     BIGINT        REFERENCES soil_profiles (id) ON DELETE SET NULL,

    -- model input features (snapshot at request time)
    ph                   NUMERIC(4,2)  NOT NULL,
    nitrogen             NUMERIC(6,2)  NOT NULL,
    organic_carbon       NUMERIC(6,2)  NOT NULL,
    clay                 NUMERIC(5,2)  NOT NULL,
    sand                 NUMERIC(5,2)  NOT NULL,
    cec                  NUMERIC(6,2)  NOT NULL,
    temperature_c        NUMERIC(5,2)  NOT NULL,
    winter_temperature_c NUMERIC(5,2)  NOT NULL,
    humidity_pct         NUMERIC(5,2)  NOT NULL CHECK (humidity_pct BETWEEN 0 AND 100),
    rainfall_mm          NUMERIC(8,2)  NOT NULL CHECK (rainfall_mm >= 0),
    monsoon_rain_share   NUMERIC(4,3)  NOT NULL CHECK (monsoon_rain_share BETWEEN 0 AND 1),
    post_monsoon_rain_share NUMERIC(4,3) CHECK (post_monsoon_rain_share BETWEEN 0 AND 1),
    dry_months           SMALLINT      CHECK (dry_months BETWEEN 0 AND 12),
    max_temperature_c    NUMERIC(5,2),
    solar_radiation      NUMERIC(5,2),
    elevation_m          NUMERIC(7,1),
    slope_degrees        NUMERIC(5,2),

    climate_source       TEXT          NOT NULL,
    model_version        TEXT          NOT NULL,   -- e.g. 'rf-india-2.0'
    season               TEXT          CHECK (season IN ('Kharif', 'Rabi', 'Summer')),   -- NULL for yearly models (1.x)
    farmer_soil          JSONB,        -- the farmer's own soil test values, if given
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX recommendations_user_idx     ON recommendations (user_id);
CREATE INDEX recommendations_location_idx ON recommendations (location_id);

-- ---------------------------------------------------------------------------
-- recommendation_items: the ranked crops returned for one recommendation,
-- with per-crop explanation data from SHAP and LIME.
-- ---------------------------------------------------------------------------
CREATE TABLE recommendation_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recommendation_id   BIGINT        NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
    rank                SMALLINT      NOT NULL CHECK (rank >= 1),
    crop                TEXT          NOT NULL,
    probability         NUMERIC(6,5)  NOT NULL CHECK (probability BETWEEN 0 AND 1),
    score               NUMERIC(5,2)  NOT NULL CHECK (score BETWEEN 0 AND 100),   -- probability x 100
    confident           BOOLEAN       NOT NULL,   -- inside the 90% conformal prediction set
    shap_values         JSONB,        -- {"Rainfall": 0.12, "pH": -0.03, ...}
    lime_weights        JSONB,
    UNIQUE (recommendation_id, rank)
);

-- ---------------------------------------------------------------------------
-- crop_feedback: "I grew this crop here and it went good / average / poor".
-- Used by ml-service/training/retrain_with_feedback.py (good and average = the crop grows there).
-- ---------------------------------------------------------------------------
CREATE TABLE crop_feedback (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recommendation_id   BIGINT      NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
    crop                TEXT        NOT NULL,
    outcome             TEXT        NOT NULL CHECK (outcome IN ('good', 'average', 'poor')),
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recommendation_id, crop)
);

COMMIT;
