-- Saved crops: the crops a farmer marks with the heart on a crop's page (new installs get this from schema.sql).
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/007_saved_crops.sql

BEGIN;

CREATE TABLE saved_crops (
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop        TEXT        NOT NULL,   -- as the model and the app name it, e.g. "pigeonpea (tur)"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, crop)
);

COMMIT;
