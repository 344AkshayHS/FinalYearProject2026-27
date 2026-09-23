-- Update for an existing GreenRoot database (new installs get this from schema.sql).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/002_soil_test_and_feedback.sql

BEGIN;

-- What the farmer typed from their own soil test, if anything: {"ph": 6.5, "organic_carbon_pct": 0.6, "n": 250, "p": 12, "k": 180}
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS farmer_soil JSONB;

-- crop_feedback: "I grew this crop here and it went good / average / poor".
-- Used by ml-service/training/retrain_with_feedback.py (good and average = the crop grows there).
CREATE TABLE IF NOT EXISTS crop_feedback (
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
