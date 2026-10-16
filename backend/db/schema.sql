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
    photo               BYTEA,                                -- small square JPEG from "Edit profile"
    photo_updated_at    TIMESTAMPTZ,                          -- null: no photo
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions: one row per logged-in device. The app sends the token with each request; only its
-- SHA-256 hash is kept here. A session ends after 30 days.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
    token_hash  TEXT        PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
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

-- admin_sessions: an admin login lasts 12 hours; only the token's SHA-256 hash is kept
CREATE TABLE admin_sessions (
    token_hash  TEXT        PRIMARY KEY,
    admin_id    BIGINT      NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '12 hours'
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
    from_gps             BOOLEAN,      -- made from the phone's GPS (not a district picked by hand); Profile's "Last checked"
    best_to_sow          TEXT,         -- the crop shown as "Best crop to sow this season" (NULL: saved before this was kept)
    hidden_at            TIMESTAMPTZ,  -- the farmer deleted it from their history (still kept here, until it is one of the oldest past 100 per farmer)
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

-- ---------------------------------------------------------------------------
-- chosen_crops: "I will grow this" - the crops a farmer chose to grow from one result (several are allowed).
-- My crops history and the bell ask how it went only about these.
-- ---------------------------------------------------------------------------
CREATE TABLE chosen_crops (
    recommendation_id   BIGINT      NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
    crop                TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (recommendation_id, crop)
);

-- ---------------------------------------------------------------------------
-- saved_crops: the crops a farmer marks with the heart on a crop's page
-- ---------------------------------------------------------------------------
CREATE TABLE saved_crops (
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop        TEXT        NOT NULL,   -- as the model and the app name it, e.g. "pigeonpea (tur)"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, crop)
);

-- ---------------------------------------------------------------------------
-- phone_codes: one-time codes sent by SMS for a new account ('register') or "Forgot password" ('reset').
-- One row per number and purpose, only the code's hash is kept. How many codes a number may get is a token bucket:
-- 3 at once, one more every 30 s, at most 5 times; 24 hours after first_sent_at it starts again (src/phone-codes.js).
-- ---------------------------------------------------------------------------
CREATE TABLE phone_codes (
    phone           TEXT        NOT NULL,
    purpose         TEXT        NOT NULL CHECK (purpose IN ('register', 'reset')),
    code_hash       TEXT        NOT NULL,
    tries           SMALLINT    NOT NULL DEFAULT 0,        -- codes typed in for it; 5 and it stops working
    expires_at      TIMESTAMPTZ NOT NULL,                  -- set to now() once the code has been used
    tokens          SMALLINT    NOT NULL DEFAULT 3,        -- codes that may be sent right now
    refills         SMALLINT    NOT NULL DEFAULT 0,        -- codes added back since first_sent_at
    refilled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),    -- the next code is added 30 s after this
    first_sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),    -- start of the 24 hours
    last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (phone, purpose)
);

-- ---------------------------------------------------------------------------
-- deleted_accounts: "Delete account permanently" deletes the account and all its data; only this copy of the login
-- details is kept (number, name, password hash). The number may make a new account later.
-- ---------------------------------------------------------------------------
CREATE TABLE deleted_accounts (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT      NOT NULL,              -- the id the account had in users
    full_name           TEXT        NOT NULL,
    phone               TEXT        NOT NULL,
    password_hash       TEXT        NOT NULL,              -- scrypt "salt:hash", as it was in users
    account_created_at  TIMESTAMPTZ NOT NULL,
    deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deleted_accounts_phone_idx ON deleted_accounts (phone);

-- ---------------------------------------------------------------------------
-- help_requests: "Send a request" in the app. The team answers by filling in reply (pgAdmin); the app shows it.
-- ---------------------------------------------------------------------------
CREATE TABLE help_requests (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic       TEXT        NOT NULL CHECK (topic IN ('history', 'account', 'app', 'other')),
    message     TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    reply       TEXT,                                  -- the team's answer, typed in pgAdmin; null: not answered yet
    replied_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX help_requests_user_idx ON help_requests (user_id);

-- ---------------------------------------------------------------------------
-- chats, chat_messages: the farmer's past chats with the crop helper (the list on the chat's side). At most 50
-- chats per farmer, 200 messages per chat (routes/chats.js).
-- ---------------------------------------------------------------------------
CREATE TABLE chats (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),   -- the first question
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chats_user_idx ON chats (user_id, updated_at DESC);

CREATE TABLE chat_messages (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id     BIGINT      NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    sender      TEXT        NOT NULL CHECK (sender IN ('user', 'bot')),
    text        TEXT        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
    general     BOOLEAN     NOT NULL DEFAULT false,   -- a general AI answer (the app marks it "please confirm")
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_chat_idx ON chat_messages (chat_id, id);

COMMIT;
