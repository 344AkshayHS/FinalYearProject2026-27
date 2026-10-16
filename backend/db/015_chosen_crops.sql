-- "I will grow this" (the gold button under a result's best crop and on a crop's page): the crops a farmer chose
-- to grow from one result. My crops history and the bell then ask "how did it go?" only about these crops, and
-- only on results where a crop was chosen. A farmer can choose several crops from one result (e.g. an intercrop).
-- Deleting a result removes its choices with it. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/015_chosen_crops.sql

BEGIN;

CREATE TABLE IF NOT EXISTS chosen_crops (
    recommendation_id   BIGINT      NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
    crop                TEXT        NOT NULL,   -- as the model and the app name it, e.g. "pigeonpea (tur)"
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (recommendation_id, crop)
);

COMMIT;
