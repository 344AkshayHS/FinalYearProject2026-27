-- "Send a request" (Profile in the app): a farmer writes to the project team, for example to get back a result they
-- deleted from their history. The team reads them here (pgAdmin) and answers by filling in "reply"; the app shows
-- the answer under the request:
--   UPDATE help_requests SET reply = 'Done: your result is back in your history.', replied_at = now() WHERE id = 1;
-- Deleting an account deletes its requests too. Safe to run twice. (new installs get this from schema.sql)
-- Apply with:  psql -U postgres -p 9999 -d greenroot -f backend/db/014_help_requests.sql

BEGIN;

CREATE TABLE IF NOT EXISTS help_requests (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic       TEXT        NOT NULL CHECK (topic IN ('history', 'account', 'app', 'other')),
    message     TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    reply       TEXT,                                  -- the team's answer, typed in pgAdmin; null: not answered yet
    replied_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS help_requests_user_idx ON help_requests (user_id);

COMMIT;
